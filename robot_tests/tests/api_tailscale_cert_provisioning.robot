*** Settings ***
Documentation    Tailscale Certificate Provisioning Tests
...
...              Tests certificate provisioning for HTTPS:
...              - Prerequisites (MagicDNS, HTTPS enabled)
...              - Certificate provisioning API
...              - Certificate file creation
...              - Error handling

Library          RequestsLibrary
Library          Process
Library          OperatingSystem
Library          ../resources/EnvConfig.py
Library          ../resources/TailscaleAdmin.py
Resource         ../resources/auth_keywords.robot
Resource         ../resources/tailscale_keywords.robot

Suite Setup      Setup Cert Provisioning Tests
Suite Teardown   Delete All Sessions

*** Variables ***
${TAILSCALE_API}    /api/tailscale
${SESSION}          cert_session
${PROJECT_ROOT}     ${CURDIR}/../..

*** Test Cases ***
Verify Container Can Authenticate
    [Documentation]    Verify temp container can authenticate with Tailscale
    [Tags]    tailscale    integration    cert    auth
    [Setup]    Start Test Tailscale Container
    [Teardown]    Cleanup Test Tailscale Container

    # Authenticate the container
    Auth Tailscale Container

    # Verify hostname was set
    Should Not Be Equal    ${HOSTNAME}    ${EMPTY}
    ...    msg=Hostname should be set after authentication

    Should Not Be Equal    ${SHORT_HOSTNAME}    ${EMPTY}
    ...    msg=Short hostname should be set after authentication

    Log    ✅ Container authenticated with hostname: ${HOSTNAME}

# NOTE: The following API tests require the main green container to be authenticated
# They test the backend API endpoints, not direct cert provisioning
# These are kept for API testing but marked with 'api' tag
# The isolated temp container tests above are the primary cert provisioning tests

Check Tailnet Settings API
    [Documentation]    Test backend API for checking tailnet settings
    ...
    ...                Requires main container authenticated
    [Tags]    tailscale    api    skip

    Skip    API test - use isolated temp container tests instead

Provision Certificate With Unique Temporary Container
    [Documentation]    Create temp container with unique name, auth, provision cert, cleanup
    ...
    ...                This test creates a completely isolated temporary container
    ...                with a unique timestamp-based hostname, provisions a certificate
    ...                for it, then cleans up everything including removing the device
    ...                from Tailscale admin console.
    ...
    ...                REQUIRES: TAILSCALE_AUTH_KEY in .env
    ...                OPTIONAL: TAILSCALE_API_KEY for admin cleanup
    [Tags]    tailscale    integration    cert    isolated    destructive
    [Setup]    Run Keywords
    ...    Start Test Tailscale Container
    ...    AND    Auth Tailscale Container
    [Teardown]    Cleanup Test Tailscale Container

    Log    Testing cert provisioning for hostname: ${HOSTNAME}

    # Provision certificate directly in temp container
    ${cert_file}=    Set Variable    /certs/${HOSTNAME}.crt
    ${key_file}=    Set Variable    /certs/${HOSTNAME}.key

    ${result}=    Run Process    docker    exec    ${CONTAINER}
    ...    tailscale    cert
    ...    --cert-file\=${cert_file}
    ...    --key-file\=${key_file}
    ...    ${HOSTNAME}
    ...    timeout=120s

    # Check if cert provisioning succeeded
    IF    ${result.rc} == 0
        Log    ✅ Certificate provisioned successfully for ${HOSTNAME}
    ELSE
        Log    ❌ Certificate provisioning failed
        Log    Stdout: ${result.stdout}
        Log    Stderr: ${result.stderr}
        Fail    Certificate provisioning failed: ${result.stderr}
    END

    # Verify cert files exist in local mounted directory
    ${local_cert}=    Set Variable    ${CERTS_DIR}/${HOSTNAME}.crt
    ${local_key}=    Set Variable    ${CERTS_DIR}/${HOSTNAME}.key

    File Should Exist    ${local_cert}
    ...    msg=Certificate file should exist at ${local_cert}

    File Should Exist    ${local_key}
    ...    msg=Key file should exist at ${local_key}

    # Verify cert has valid PEM format
    ${cert_content}=    Get File    ${local_cert}
    Should Contain    ${cert_content}    -----BEGIN CERTIFICATE-----
    Should Contain    ${cert_content}    -----END CERTIFICATE-----

    Log    ✅ Certificate verified: ${local_cert}

*** Keywords ***
Setup Cert Provisioning Tests
    [Documentation]    Setup authenticated API session

    # Get authenticated session
    ${session_alias}=    Get Admin API Session
    Set Suite Variable    ${SESSION}    ${session_alias}
