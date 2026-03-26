*** Settings ***
Documentation    Authentication keywords for creating authenticated API sessions.
...              Tests authenticate through Casdoor (password grant) — no local auth bypass.

Library          RequestsLibrary
Library          REST             ${BACKEND_URL}    ssl_verify=false
Library          Collections
Library          EnvConfig.py
Variables        setup/test_env.py

*** Keywords ***
Setup REST Auth Headers
    [Documentation]    Fetch a Casdoor JWT and apply it as a Bearer token to the REST library.
    ...                Called by Standard Suite Setup so every test suite is authenticated.
    ${token}=    Get Casdoor Token
    Set Headers    {"Authorization": "Bearer ${token}"}

Get Casdoor Token
    [Documentation]    Get a JWT from Casdoor via the password grant (ROPC).
    ...                Uses CASDOOR_APP_ADMIN_USER / CASDOOR_APP_ADMIN_PASSWORD from .env.test.

    ${body}=    Create Dictionary
    ...    grant_type=password
    ...    client_id=${CASDOOR_CLIENT_ID}
    ...    client_secret=${CASDOOR_CLIENT_SECRET}
    ...    username=${CASDOOR_APP_ADMIN_USER}
    ...    password=${CASDOOR_APP_ADMIN_PASSWORD}

    Create Session    casdoor_token    ${CASDOOR_URL}    verify=False
    ${response}=    POST On Session    casdoor_token    /api/login/oauth/access_token    json=${body}
    Delete All Sessions

    RETURN    ${response.json()['access_token']}

Get Admin API Session
    [Documentation]    Create an authenticated RequestsLibrary session using a Casdoor JWT.
    ...                Returns session alias "admin_session".

    ${api_url}=      Get Api Url
    ${token}=        Get Casdoor Token

    ${auth_headers}=    Create Dictionary    Authorization=Bearer ${token}
    Create Session    admin_session    ${api_url}    headers=${auth_headers}    verify=${False}

    RETURN    admin_session
