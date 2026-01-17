*** Settings ***
Documentation    Reusable keywords for Tailscale testing
...
...              Provides standard operations for creating temporary test containers,
...              authenticating them, and cleaning up resources.

Library          Process
Library          OperatingSystem
Library          EnvConfig.py
Library          TailscaleAdmin.py

*** Keywords ***
Start Test Tailscale Container
    [Documentation]    Create and start a temporary Tailscale container with unique name
    ...
    ...                Sets test variables: CONTAINER, VOLUME, CERTS_DIR
    ...
    ...                This keyword creates a unique timestamp-based container but does NOT
    ...                authenticate it. Use "Auth Tailscale Container" separately to authenticate.

    # Generate unique container suffix (timestamp-based)
    ${timestamp}=    Get Time    epoch
    ${unique_suffix}=    Set Variable    test-${timestamp}
    ${container_name}=    Set Variable    ushadow-${unique_suffix}-tailscale
    ${volume_name}=    Set Variable    ushadow-${unique_suffix}-tailscale-state
    Set Test Variable    ${HOSTNAME}    ${unique_suffix}.spangled-kettle.ts.net

    # Get project root
    ${project_root}=    Set Variable    ${CURDIR}/../..

    # Create temp directory for certs
    ${certs_dir}=    Set Variable    ${project_root}/config/SECRETS/certs-${unique_suffix}
    Create Directory    ${certs_dir}

    Log    🔧 Creating temporary Tailscale container: ${container_name}

    # Create volume
    ${result}=    Run Process    docker    volume    create    ${volume_name}
    Should Be Equal As Integers    ${result.rc}    0
    ...    msg=Failed to create volume: ${result.stderr}

    # Start container (without auth key - authentication is separate step)
    # Note: Must run tailscaled in background and sleep infinity to keep container alive
    ${result}=    Run Process    docker    run    -d
    ...    --name\=${container_name}
    ...    --network\=infra-network
    ...    --hostname\=${unique_suffix}
    ...    -v    ${certs_dir}:/certs
    ...    -v    ${volume_name}:/var/lib/tailscale
    ...    -e    TS_STATE_DIR\=/var/lib/tailscale
    ...    tailscale/tailscale:stable
    ...    sh    -c
    ...    tailscaled --tun\=userspace-networking --statedir\=/var/lib/tailscale & sleep infinity

    Should Be Equal As Integers    ${result.rc}    0
    ...    msg=Failed to start container: ${result.stderr}

    Log    ✅ Temporary container started: ${container_name}

    # Store as test variables for use in test and teardown
    Set Test Variable    ${CONTAINER}    ${container_name}
    Set Test Variable    ${VOLUME}    ${volume_name}
    Set Test Variable    ${CERTS_DIR}    ${certs_dir}

Auth Tailscale Container
    [Documentation]    Authenticate a Tailscale container using auth key
    ...
    ...                Sets test variables: HOSTNAME, SHORT_HOSTNAME
    ...                Uses test variable: CONTAINER
    ...
    ...                Requires TAILSCALE_AUTH_KEY in .env

    # Get auth key from environment
    ${auth_key}=    Get Env Value    TAILSCALE_AUTH_KEY    ${EMPTY}
    Should Not Be Equal    ${auth_key}    ${EMPTY}
    ...    msg=TAILSCALE_AUTH_KEY not set in .env - required for authentication

    Log    🔐 Authenticating container: ${CONTAINER}

    # Authenticate using auth key
    ${result}=    Run Process    docker    exec    ${CONTAINER}
    ...    tailscale    up
    ...    --authkey\=${auth_key}
    ...    --accept-routes

    Should Be Equal As Integers    ${result.rc}    0
    ...    msg=Failed to authenticate: ${result.stderr}

    # Wait for authentication to complete
    Sleep    3s    reason=Wait for authentication to complete

    # Get hostname from container
    ${result}=    Run Process    docker    exec    ${CONTAINER}
    ...    tailscale    status    --json

    Should Be Equal As Integers    ${result.rc}    0
    ...    msg=Failed to get status: ${result.stderr}

    # Parse hostname from status
    ${status_json}=    Evaluate    json.loads('''${result.stdout}''')    json
    ${short_hostname}=    Get From Dictionary    ${status_json}[Self]    HostName

    # Construct full FQDN: hostname.tailnet
    ${tailnet}=    Get Env Value    TAILSCALE_TAILNET    spangled-kettle.ts.net
    ${full_hostname}=    Set Variable    ${short_hostname}.${tailnet}

    Log    ✅ Container authenticated with hostname: ${full_hostname}

    # Store as test variables
    Set Test Variable    ${HOSTNAME}    ${full_hostname}
    Set Test Variable    ${SHORT_HOSTNAME}    ${short_hostname}

Stop Test Tailscale Container
    [Documentation]    Stop and remove a test Tailscale container
    ...
    ...                Arguments:
    ...                - container_name: Name of the container to stop
    ...                - volume_name: Name of the volume to remove (optional)

    [Arguments]    ${container_name}    ${volume_name}=${EMPTY}

    Log    🛑 Stopping container: ${container_name}

    # Stop and remove container
    Run Process    docker    stop    ${container_name}
    Run Process    docker    rm    ${container_name}

    # Remove volume if provided
    IF    '${volume_name}' != '${EMPTY}'
        Run Process    docker    volume    rm    ${volume_name}
        Log    ✅ Volume removed: ${volume_name}
    END

    Log    ✅ Container removed: ${container_name}

Cleanup Test Tailscale Container
    [Documentation]    Complete cleanup: container, volume, certs, admin device
    ...
    ...                Uses test variables: CONTAINER, VOLUME, CERTS_DIR, SHORT_HOSTNAME
    ...                Optional argument: keep_certs_on_failure (default: True)

    [Arguments]    ${keep_certs_on_failure}=${True}

    # Check if variables exist (cleanup may run even if setup failed)
    ${has_container}=    Run Keyword And Return Status    Variable Should Exist    ${CONTAINER}
    ${has_volume}=    Run Keyword And Return Status    Variable Should Exist    ${VOLUME}
    ${has_certs_dir}=    Run Keyword And Return Status    Variable Should Exist    ${CERTS_DIR}
    ${has_hostname}=    Run Keyword And Return Status    Variable Should Exist    ${SHORT_HOSTNAME}

    IF    not ${has_container}
        Log    ⚠️ No container to clean up (setup may have failed)    WARN
        RETURN
    END

    Log    🧹 Cleaning up test container: ${CONTAINER}

    # Delete cert files
    IF    ${has_certs_dir}
        IF    ${keep_certs_on_failure}
            Run Keyword If Test Failed    Log    Test failed, keeping certs: ${CERTS_DIR}    WARN
            Run Keyword If Test Passed    Remove Directory    ${CERTS_DIR}    recursive=True
        ELSE
            Remove Directory    ${CERTS_DIR}    recursive=True
        END
    END

    # Stop and remove container
    Run Process    docker    stop    ${CONTAINER}
    Run Process    docker    rm    ${CONTAINER}
    Log    ✅ Container removed

    # Remove volume
    IF    ${has_volume}
        Run Process    docker    volume    rm    ${VOLUME}
        Log    ✅ Volume removed
    END

    # Remove device from Tailscale admin (if hostname available)
    IF    ${has_hostname}
        ${api_configured}=    Is API Configured
        IF    ${api_configured}
            Log    Attempting to remove device from Tailscale admin
            ${deleted}=    Delete Device By Hostname    ${SHORT_HOSTNAME}
            IF    ${deleted}
                Log    ✅ Device removed from Tailscale admin
            ELSE
                Log    ⚠️ Could not remove device from admin
                Log    ⚠️ Manual cleanup: https://login.tailscale.com/admin/machines
            END
        ELSE
            Log    ⚠️ TAILSCALE_API_KEY not configured - manual cleanup required
            Log    ⚠️ Device to remove: ${SHORT_HOSTNAME}
            Log    ⚠️ https://login.tailscale.com/admin/machines
        END
    END

    Log    ✅ Cleanup complete

Wait For Tailscale Connection
    [Documentation]    Wait for Tailscale container to be fully connected
    ...
    ...                Arguments:
    ...                - container_name: Name of the container
    ...                - timeout_seconds: Max wait time (default: 30)

    [Arguments]    ${container_name}    ${timeout_seconds}=30

    Log    ⏳ Waiting for Tailscale connection...

    FOR    ${i}    IN RANGE    ${timeout_seconds}
        ${result}=    Run Process    docker    exec    ${container_name}
        ...    tailscale    status    --json

        IF    ${result.rc} == 0
            ${status_json}=    Evaluate    json.loads('''${result.stdout}''')    json
            ${online}=    Get From Dictionary    ${status_json}[Self]    Online    default=${False}

            IF    ${online}
                Log    ✅ Container is online
                RETURN
            END
        END

        Sleep    1s
    END

    Fail    Container did not come online within ${timeout_seconds} seconds

Get Tailscale Container Status
    [Documentation]    Get status information from a Tailscale container
    ...
    ...                Arguments:
    ...                - container_name: Name of the container
    ...
    ...                Returns: Status JSON as dictionary

    [Arguments]    ${container_name}

    ${result}=    Run Process    docker    exec    ${container_name}
    ...    tailscale    status    --json

    Should Be Equal As Integers    ${result.rc}    0
    ...    msg=Failed to get status: ${result.stderr}

    ${status_json}=    Evaluate    json.loads('''${result.stdout}''')    json

    RETURN    ${status_json}
