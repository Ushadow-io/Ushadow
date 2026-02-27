use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// A single event captured from a Claude Code session hook
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSessionEvent {
    pub event_type: String,
    pub session_id: String,
    pub cwd: String,
    pub timestamp: String,   // ISO 8601
    pub data: Value,         // event-specific payload
}

/// The Python hook script content, embedded at compile time.
/// Installed to ~/.claude/hooks/ushadow_launcher_hook.py
const HOOK_SCRIPT: &str = r#"#!/usr/bin/env python3
# Ushadow Launcher - Claude Code session event logger
# Appends hook events to ~/.claude/ushadow_sessions.jsonl
import sys
import json
import os
import datetime

try:
    raw = sys.stdin.read()
    data = json.loads(raw) if raw.strip() else {}
except Exception:
    data = {}

hook_name = data.get("hook_event_name", "unknown")
event = {
    "event_type": hook_name,
    "session_id": data.get("session_id", ""),
    "cwd": data.get("cwd", ""),
    "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
    "data": {},
}

if hook_name == "UserPromptSubmit":
    msg = data.get("message", "")
    event["data"] = {"message": msg[:500] if msg else ""}

elif hook_name == "PreToolUse":
    tool_input = data.get("tool_input", {})
    # Capture human-readable description or command as the headline
    description = tool_input.get("description", "") or tool_input.get("command", "")
    # Capture file path for Read/Write/Edit/Glob operations
    path = tool_input.get("file_path", "") or tool_input.get("path", "") or tool_input.get("pattern", "")
    event["data"] = {
        "tool": data.get("tool_name", ""),
        "tool_use_id": data.get("tool_use_id", ""),
        "description": description[:300] if description else "",
        "path": path[:300] if path else "",
    }

elif hook_name == "PostToolUse":
    event["data"] = {
        "tool": data.get("tool_name", ""),
        "tool_use_id": data.get("tool_use_id", ""),
    }

elif hook_name == "Notification":
    event["data"] = {
        "message": data.get("message", ""),
        "type": data.get("notification_type", ""),
        "title": data.get("title", ""),
    }

elif hook_name == "Stop":
    msg = data.get("last_assistant_message", "")
    event["data"] = {"last_message": msg[:500] if msg else ""}

elif hook_name in ("SessionStart", "SessionEnd", "SubagentStop"):
    event["data"] = {"source": data.get("source", "")}

elif hook_name == "PreCompact":
    event["data"] = {"compaction_type": data.get("compaction_type", "")}

log_path = os.path.expanduser("~/.claude/ushadow_sessions.jsonl")
os.makedirs(os.path.dirname(log_path), exist_ok=True)
with open(log_path, "a") as f:
    f.write(json.dumps(event) + "\n")
"#;

/// Hook entries to merge into ~/.claude/settings.json
const HOOK_COMMAND: &str =
    "python3 ~/.claude/hooks/ushadow_launcher_hook.py";

fn get_claude_hooks_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let hooks_dir = home.join(".claude").join("hooks");
    if !hooks_dir.exists() {
        fs::create_dir_all(&hooks_dir)
            .map_err(|e| format!("Failed to create hooks directory: {}", e))?;
    }
    Ok(hooks_dir)
}

fn get_claude_settings_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let claude_dir = home.join(".claude");
    if !claude_dir.exists() {
        fs::create_dir_all(&claude_dir)
            .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
    }
    Ok(claude_dir.join("settings.json"))
}

fn get_sessions_file_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".claude").join("ushadow_sessions.jsonl"))
}

/// Check if our hook command is already in a given event's hook array
fn is_already_registered(settings: &Value, event_name: &str) -> bool {
    settings["hooks"][event_name]
        .as_array()
        .map(|arr| {
            arr.iter().any(|entry| {
                entry["hooks"]
                    .as_array()
                    .map(|h| h.iter().any(|handler| handler["command"].as_str() == Some(HOOK_COMMAND)))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

/// Install the Ushadow launcher hooks into Claude Code's global settings.
/// Merges our hook entries without overwriting existing user hooks.
#[tauri::command]
pub async fn install_claude_hooks() -> Result<String, String> {
    // 1. Write the Python hook script
    let hooks_dir = get_claude_hooks_dir()?;
    let script_path = hooks_dir.join("ushadow_launcher_hook.py");
    fs::write(&script_path, HOOK_SCRIPT)
        .map_err(|e| format!("Failed to write hook script: {}", e))?;

    // Make it executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&script_path)
            .map_err(|e| format!("Failed to read script permissions: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&script_path, perms)
            .map_err(|e| format!("Failed to set script permissions: {}", e))?;
    }

    // 2. Read existing ~/.claude/settings.json (or start fresh)
    let settings_path = get_claude_settings_path()?;
    let mut settings: Value = if settings_path.exists() {
        let raw = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings.json: {}", e))?;
        serde_json::from_str(&raw).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // 3. Ensure "hooks" key is an object
    if !settings.get("hooks").map(|v| v.is_object()).unwrap_or(false) {
        settings["hooks"] = serde_json::json!({});
    }

    let hook_handler = serde_json::json!({
        "type": "command",
        "command": HOOK_COMMAND,
        "async": true
    });

    // 4. Events without tool matchers
    let simple_events = [
        "SessionStart",
        "SessionEnd",
        "UserPromptSubmit",
        "SubagentStop",
        "Stop",
        "Notification",
    ];

    for event_name in &simple_events {
        if !settings["hooks"][event_name].is_array() {
            settings["hooks"][event_name] = serde_json::json!([]);
        }
        if !is_already_registered(&settings, event_name) {
            let new_entry = serde_json::json!({ "hooks": [hook_handler.clone()] });
            settings["hooks"][event_name].as_array_mut().unwrap().push(new_entry);
        }
    }

    // 5. Events with wildcard tool matcher
    let wildcard_events = ["PreToolUse", "PostToolUse"];
    for event_name in &wildcard_events {
        if !settings["hooks"][event_name].is_array() {
            settings["hooks"][event_name] = serde_json::json!([]);
        }
        if !is_already_registered(&settings, event_name) {
            let new_entry = serde_json::json!({
                "matcher": "*",
                "hooks": [hook_handler.clone()]
            });
            settings["hooks"][event_name].as_array_mut().unwrap().push(new_entry);
        }
    }

    // 6. PreCompact needs separate auto/manual matcher entries
    if !settings["hooks"]["PreCompact"].is_array() {
        settings["hooks"]["PreCompact"] = serde_json::json!([]);
    }
    if !is_already_registered(&settings, "PreCompact") {
        for compact_type in &["auto", "manual"] {
            let new_entry = serde_json::json!({
                "matcher": compact_type,
                "hooks": [hook_handler.clone()]
            });
            settings["hooks"]["PreCompact"].as_array_mut().unwrap().push(new_entry);
        }
    }

    // 7. Write back
    let json_out = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&settings_path, json_out)
        .map_err(|e| format!("Failed to write settings.json: {}", e))?;

    Ok(format!(
        "Hooks installed to {} and {}",
        script_path.display(),
        settings_path.display()
    ))
}

/// Check whether the Ushadow launcher hook script is installed.
#[tauri::command]
pub async fn get_hooks_installed() -> Result<bool, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let script_path = home
        .join(".claude")
        .join("hooks")
        .join("ushadow_launcher_hook.py");
    Ok(script_path.exists())
}

/// A single message in a Claude conversation transcript
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallInfo {
    pub name: String,
    pub description: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptMessage {
    pub role: String,             // "user" | "assistant"
    pub text: Option<String>,     // main text content (truncated to 2000 chars)
    pub tools: Vec<ToolCallInfo>, // tool calls within this assistant turn
    pub timestamp: String,
    pub message_id: String,
}

/// Extract clean user text, filtering out system injections
fn extract_user_text(content: &Value) -> Option<String> {
    let text = match content {
        Value::String(s) => s.clone(),
        Value::Array(blocks) => {
            let parts: Vec<&str> = blocks
                .iter()
                .filter_map(|b| {
                    if b["type"].as_str() == Some("text") {
                        b["text"].as_str()
                    } else {
                        None
                    }
                })
                .collect();
            parts.join(" ")
        }
        _ => return None,
    };

    let trimmed = text.trim();
    if trimmed.is_empty()
        || trimmed.starts_with('<')
        || trimmed.starts_with('[')
        || trimmed.contains("<system-reminder>")
        || trimmed.contains("<task-notification>")
    {
        return None;
    }

    if trimmed.len() > 1000 {
        Some(format!("{}…", &trimmed[..1000]))
    } else {
        Some(trimmed.to_string())
    }
}

/// Read the full conversation transcript for a specific Claude session.
/// Maps CWD to the ~/.claude/projects/{dir}/{session_id}.jsonl path.
/// Deduplicates streaming chunks by keeping only the last entry per message ID.
#[tauri::command]
pub async fn read_claude_transcript(
    session_id: String,
    cwd: String,
) -> Result<Vec<TranscriptMessage>, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;

    // Map CWD to project dir: replace "/" with "-"
    // e.g., "/Users/stu/repos/foo" → "-Users-stu-repos-foo"
    let project_dir = cwd.replace('/', "-");

    let session_file = home
        .join(".claude")
        .join("projects")
        .join(&project_dir)
        .join(format!("{}.jsonl", session_id));

    if !session_file.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&session_file)
        .map_err(|e| format!("Failed to read transcript: {}", e))?;

    // Deduplicate by message_id — streaming sends incremental chunks sharing the same ID,
    // so we only want the last (most complete) entry per ID, in original order.
    let mut order: Vec<String> = Vec::new();
    let mut by_id: HashMap<String, Value> = HashMap::new();

    for line in content.lines().filter(|l| !l.trim().is_empty()) {
        let obj: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let entry_type = obj["type"].as_str().unwrap_or("");
        if entry_type != "user" && entry_type != "assistant" {
            continue;
        }

        let msg_id = if entry_type == "assistant" {
            obj["message"]["id"].as_str().unwrap_or("").to_string()
        } else {
            obj["uuid"].as_str().unwrap_or("").to_string()
        };

        if msg_id.is_empty() {
            continue;
        }

        if !by_id.contains_key(&msg_id) {
            order.push(msg_id.clone());
        }
        by_id.insert(msg_id, obj);
    }

    let mut messages: Vec<TranscriptMessage> = Vec::new();

    for id in &order {
        let obj = match by_id.get(id) {
            Some(v) => v,
            None => continue,
        };

        let entry_type = obj["type"].as_str().unwrap_or("");
        let msg = &obj["message"];
        let timestamp = obj["timestamp"].as_str().unwrap_or("").to_string();

        match entry_type {
            "user" => {
                if let Some(text) = extract_user_text(&msg["content"]) {
                    messages.push(TranscriptMessage {
                        role: "user".to_string(),
                        text: Some(text),
                        tools: vec![],
                        timestamp,
                        message_id: id.clone(),
                    });
                }
            }
            "assistant" => {
                let content = match msg["content"].as_array() {
                    Some(a) => a,
                    None => continue,
                };

                let mut text_parts: Vec<String> = Vec::new();
                let mut tools: Vec<ToolCallInfo> = Vec::new();

                for block in content {
                    match block["type"].as_str() {
                        Some("text") => {
                            if let Some(t) = block["text"].as_str() {
                                let trimmed = t.trim();
                                if !trimmed.is_empty() {
                                    text_parts.push(trimmed.to_string());
                                }
                            }
                        }
                        Some("tool_use") => {
                            let name = block["name"].as_str().unwrap_or("").to_string();
                            if name.is_empty() {
                                continue;
                            }
                            let input = &block["input"];
                            let description = input["description"]
                                .as_str()
                                .or_else(|| input["command"].as_str())
                                .or_else(|| input["prompt"].as_str())
                                .map(|s| s.chars().take(200).collect::<String>());
                            let path = input["file_path"]
                                .as_str()
                                .or_else(|| input["path"].as_str())
                                .or_else(|| input["pattern"].as_str())
                                .map(|s| s.to_string());
                            tools.push(ToolCallInfo { name, description, path });
                        }
                        _ => {} // skip thinking, other block types
                    }
                }

                let joined = text_parts.join("\n\n");
                let text = if joined.is_empty() {
                    None
                } else if joined.len() > 2000 {
                    Some(format!("{}…", &joined[..2000]))
                } else {
                    Some(joined)
                };

                if text.is_some() || !tools.is_empty() {
                    messages.push(TranscriptMessage {
                        role: "assistant".to_string(),
                        text,
                        tools,
                        timestamp,
                        message_id: id.clone(),
                    });
                }
            }
            _ => {}
        }
    }

    // Return the last 30 messages to keep the payload manageable
    if messages.len() > 30 {
        let skip = messages.len() - 30;
        messages = messages.into_iter().skip(skip).collect();
    }

    Ok(messages)
}

/// Send an approval (y) or denial (n) keystroke to the tmux pane running Claude
/// in the given working directory. Matches panes by longest path prefix,
/// preferring panes whose current command is claude/node.
#[tauri::command]
pub async fn send_claude_approval(cwd: String, approve: bool) -> Result<String, String> {
    let output = std::process::Command::new("tmux")
        .args([
            "list-panes", "-a", "-F",
            "#{pane_current_path}\t#{session_name}:#{window_index}.#{pane_index}\t#{pane_current_command}",
        ])
        .output()
        .map_err(|e| format!("tmux unavailable: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Normalize trailing slashes so /foo/ and /foo both match
    let norm_cwd = cwd.trim_end_matches('/');

    // Collect all matching panes: (path_match_len, is_claude_pane, target)
    let mut candidates: Vec<(usize, bool, String)> = stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, '\t');
            let pane_path = parts.next()?.trim_end_matches('/');
            let pane_target = parts.next()?;
            let pane_cmd = parts.next().unwrap_or("");

            let is_claude = pane_cmd.contains("claude") || pane_cmd.contains("node");

            if norm_cwd.starts_with(pane_path) || pane_path.starts_with(norm_cwd) {
                Some((pane_path.len(), is_claude, pane_target.to_string()))
            } else {
                None
            }
        })
        .collect();

    // Sort: longest path match first, then prefer claude/node panes
    candidates.sort_by(|(la, ca, _), (lb, cb, _)| lb.cmp(la).then(cb.cmp(ca)));

    let target = candidates
        .into_iter()
        .next()
        .map(|(_, _, t)| t)
        .ok_or_else(|| {
            format!(
                "No tmux pane found for: {}. Is claude running in tmux?",
                cwd
            )
        })?;

    let key = if approve { "y" } else { "n" };
    std::process::Command::new("tmux")
        .args(["send-keys", "-t", &target, key, "Enter"])
        .output()
        .map_err(|e| format!("Failed to send key: {}", e))?;

    Ok(format!("Sent '{}' to {}", key, target))
}

/// Read Claude session events from the JSONL log file.
/// Returns all events from the last 24 hours across all projects.
#[tauri::command]
pub async fn read_claude_sessions(_project_root: String) -> Result<Vec<ClaudeSessionEvent>, String> {
    let sessions_path = get_sessions_file_path()?;

    if !sessions_path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&sessions_path)
        .map_err(|e| format!("Failed to read sessions file: {}", e))?;

    let cutoff = chrono::Utc::now() - chrono::Duration::hours(24);

    let mut events: Vec<ClaudeSessionEvent> = content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str::<ClaudeSessionEvent>(line).ok())
        .filter(|event| {
            chrono::DateTime::parse_from_rfc3339(&event.timestamp)
                .map(|ts| ts.with_timezone(&chrono::Utc) > cutoff)
                .unwrap_or(true)
        })
        .collect();

    // Most recent 500 events to keep payload manageable
    if events.len() > 500 {
        let skip = events.len() - 500;
        events = events.into_iter().skip(skip).collect();
    }

    Ok(events)
}
