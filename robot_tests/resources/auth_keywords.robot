*** Settings ***
Documentation    Authentication keywords
...
...              Keywords for creating authenticated API sessions
...              and managing authentication tokens.

Library          RequestsLibrary
Library          Collections
Library          EnvConfig.py

*** Variables ***
${ADMIN_EMAIL}       admin@example.com
${ADMIN_PASSWORD}    password

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

    # Get API URL from .env file
    ${api_url}=      Get Api Url

    Create Session    api    ${api_url}    verify=True

    # Login to get JWT token using JSON format (not form data)
    ${auth_data}=    Create Dictionary    email=${ADMIN_EMAIL}    password=${ADMIN_PASSWORD}

    ${response}=     POST On Session    api    /api/auth/login
    ...              json=${auth_data}
    ...              expected_status=200

    ${token}=        Set Variable    ${response.json()}[access_token]

    # Create new session with auth headers
    ${auth_headers}=    Create Dictionary    Authorization=Bearer ${token}
    Create Session    admin_session    ${api_url}    headers=${auth_headers}    verify=True

    RETURN    admin_session
