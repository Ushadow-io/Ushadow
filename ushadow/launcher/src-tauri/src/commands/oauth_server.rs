/// OAuth callback server for desktop authentication
///
/// Implements the standard OAuth flow for desktop apps:
/// 1. Start temporary HTTP server on random port
/// 2. Register http://localhost:PORT/callback with Keycloak
/// 3. Open system browser for login
/// 4. Catch redirect, exchange code for tokens
/// 5. Shut down server

use std::sync::{Arc, Mutex};
use tauri::State;
use tokio::sync::oneshot;
use warp::{Filter, Reply};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct OAuthCallbackParams {
    pub code: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct OAuthResult {
    pub success: bool,
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

/// Start OAuth callback server and return the port and callback URL
///
/// This starts a temporary HTTP server that waits for the OAuth callback.
/// The server automatically shuts down after receiving the callback or timing out.
#[tauri::command]
pub async fn start_oauth_server() -> Result<(u16, String), String> {
    use warp::Filter;

    // Find available port
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind to port: {}", e))?;
    let port = listener.local_addr()
        .map_err(|e| format!("Failed to get local address: {}", e))?
        .port();
    drop(listener);

    let callback_url = format!("http://localhost:{}/callback", port);

    println!("[OAuth] Started callback server on port {}", port);
    println!("[OAuth] Callback URL: {}", callback_url);

    Ok((port, callback_url))
}

/// Wait for OAuth callback
///
/// This blocks until the callback is received or times out (5 minutes).
/// Returns the authorization code and state from the callback.
#[tauri::command]
pub async fn wait_for_oauth_callback(port: u16) -> Result<OAuthResult, String> {
    use std::time::Duration;
    use tokio::time::timeout;

    let result = Arc::new(Mutex::new(None));
    let result_clone = result.clone();

    // Create shutdown signal
    let (tx, rx) = oneshot::channel::<()>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    // Callback route handler
    let callback_route = warp::path("callback")
        .and(warp::query::<OAuthCallbackParams>())
        .map(move |params: OAuthCallbackParams| {
            println!("[OAuth] Callback received: code={}, state={}",
                params.code.chars().take(10).collect::<String>(),
                params.state.chars().take(10).collect::<String>()
            );

            // Store result
            {
                let mut result = result_clone.lock().unwrap();
                *result = Some(OAuthResult {
                    success: true,
                    code: Some(params.code.clone()),
                    state: Some(params.state.clone()),
                    error: None,
                });
            }

            // Trigger shutdown
            if let Some(tx) = tx.lock().unwrap().take() {
                let _ = tx.send(());
            }

            // Return success page
            warp::reply::html(
                r#"
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Login Successful</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            height: 100vh;
                            margin: 0;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        }
                        .container {
                            text-align: center;
                            background: white;
                            padding: 3rem;
                            border-radius: 1rem;
                            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        }
                        h1 {
                            color: #667eea;
                            margin: 0 0 1rem 0;
                        }
                        p {
                            color: #555;
                            margin: 0;
                        }
                        .checkmark {
                            font-size: 4rem;
                            color: #48bb78;
                            margin-bottom: 1rem;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="checkmark">✓</div>
                        <h1>Login Successful!</h1>
                        <p>You can close this window and return to the Ushadow Launcher.</p>
                    </div>
                    <script>
                        // Auto-close after 2 seconds
                        setTimeout(() => window.close(), 2000);
                    </script>
                </body>
                </html>
                "#
            )
        });

    // Start server
    let server = warp::serve(callback_route)
        .bind_with_graceful_shutdown(([127, 0, 0, 1], port), async {
            rx.await.ok();
        });

    // Run server with timeout
    let server_task = tokio::spawn(server.1);

    // Wait for callback or timeout (5 minutes)
    match timeout(Duration::from_secs(300), async {
        loop {
            if result.lock().unwrap().is_some() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }).await {
        Ok(_) => {
            // Got callback
            let result = result.lock().unwrap().take().unwrap();
            println!("[OAuth] Callback processed successfully");

            // Shut down server
            server_task.abort();

            Ok(result)
        }
        Err(_) => {
            // Timeout
            println!("[OAuth] Callback timeout (5 minutes)");
            server_task.abort();

            Ok(OAuthResult {
                success: false,
                code: None,
                state: None,
                error: Some("Timeout waiting for login".to_string()),
            })
        }
    }
}
