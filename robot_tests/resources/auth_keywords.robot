*** Settings ***
Documentation    Authentication keywords
...
...              Keywords for creating authenticated API sessions
...              and managing authentication tokens.

Library          RequestsLibrary
Library          Collections

*** Variables ***
${API_URL}           http://localhost:8001
${ADMIN_EMAIL}       admin@test.example.com
${ADMIN_PASSWORD}    test-admin-password-123

*** Keywords ***
Get Admin API Session
    [Documentation]    Create an authenticated API session for admin user
    ...
    ...                Creates a session with authentication token that can be
    ...                reused across multiple requests.
    ...
    ...                Returns: Session alias (usually "admin_session")
    ...
    ...                Example:
    ...                | ${session}= | Get Admin API Session |
    ...                | GET On Session | ${session} | /api/endpoint |

    Create Session    api    ${API_URL}    verify=True

    # Login to get JWT token
    ${auth_data}=    Create Dictionary    username=${ADMIN_EMAIL}    password=${ADMIN_PASSWORD}
    ${headers}=      Create Dictionary    Content-Type=application/x-www-form-urlencoded

    ${response}=     POST On Session    api    /auth/jwt/login
    ...              data=${auth_data}
    ...              headers=${headers}
    ...              expected_status=200

    ${token}=        Set Variable    ${response.json()}[access_token]

    # Create new session with auth headers
    ${auth_headers}=    Create Dictionary    Authorization=Bearer ${token}
    Create Session    admin_session    ${API_URL}    headers=${auth_headers}    verify=True

    [Return]    admin_session
