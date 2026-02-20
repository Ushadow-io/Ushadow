*** Settings ***
Documentation    Flexible setup keywords for test environments
...
...              DEFAULT MODE: Dev mode - keeps containers running for fast iteration
...
...              This file provides two primary modes:
...              - Dev Mode (default): Reuse containers, clear data only (~5s)
...              - Prod Mode: Complete teardown and rebuild (for CI/CD)
...
...              Control via environment variables:
...              - TEST_MODE: 'dev' (default) or 'prod' (CI/CD mode)
...              - REBUILD: Force container rebuild (dev mode only)
...
...              Quick usage:
...              - robot robot_tests/                 # Dev mode (fast, keep containers)
...              - TEST_MODE=prod robot robot_tests/  # Prod mode (CI/CD, fresh env)

Library          RequestsLibrary
Library          Collections
Library          OperatingSystem
Library          String
Library          Process
Variables        test_env.py
Variables        suppress_warnings.py    # Suppress urllib3 warnings during startup

*** Keywords ***

Suite Setup
    [Documentation]    Flexible setup based on TEST_MODE environment variable
    ...                DEFAULT: dev mode (keep containers running)
    ...                TEST_MODE=prod for CI/CD (fresh environment)

    # Get test mode (default: dev)
    ${test_mode}=    Get Environment Variable    TEST_MODE    default=dev
    ${rebuild}=      Get Environment Variable    REBUILD      default=false

    # Handle different startup modes
    Run Keyword If    '${test_mode}' == 'prod'     Prod Mode Setup
    ...    ELSE IF    '${rebuild}' == 'true'       Dev Mode Setup With Rebuild
    ...    ELSE                                     Dev Mode Setup

Standard Suite Setup
    [Documentation]    Standard test suite setup - alias for Suite Setup
    ...                Used by most test files for consistency with oldtests pattern
    Suite Setup

Standard Suite Teardown
    [Documentation]    Standard test suite teardown - alias for Suite Teardown
    ...                Used by most test files for consistency with oldtests pattern
    Suite Teardown

Dev Mode Setup
    [Documentation]    Default development mode - reuse containers, clear data only (fastest)
    Log To Console    \n=== Dev Mode Setup (Default) ===

    Log To Console    Checking if test containers are ready...
    ${all_ready}=    Check All Services Ready

    IF    ${all_ready}
        Log To Console    ✓ Reusing existing containers (fast mode)
        Clear Test Data
    ELSE
        Log To Console    ⚠ Not all containers running, starting them...
        Start Test Containers
        Clear Test Data
    END

    Log To Console    ✓ Dev environment ready!

Dev Mode Setup With Rebuild
    [Documentation]    Dev mode with forced rebuild (after code changes)
    Log To Console    \n=== Dev Mode Setup (with rebuild) ===

    Rebuild Test Containers

    Log To Console    Clearing test data...
    Clear Test Data
    Log To Console    ✓ Dev environment ready!

Prod Mode Setup
    [Documentation]    Production/CI mode - complete teardown and rebuild (clean slate)
    Log To Console    \n=== Prod Mode Setup (CI/CD) ===
    Log To Console    Tearing down existing containers and volumes...

    Stop Test Containers    remove_volumes=${True}

    Log To Console    Building and starting fresh containers...
    Start Test Containers    build=${True}

    Log To Console    ✓ Prod environment ready!

Start Test Containers
    [Documentation]    Start test containers using docker-compose
    [Arguments]    ${build}=${False}

    ${all_ready}=    Check All Services Ready

    IF    ${all_ready}
        Log To Console    ✓ All test containers already running and healthy
        RETURN
    END

    # Start/update containers (docker compose up -d handles existing containers gracefully)
    # This will start any missing services without recreating existing healthy ones
    IF    ${build}
        Log To Console    Building and starting all containers...
        ${result}=    Run Process    docker    compose    -f    ${DOCKER_COMPOSE_FILE}    up    -d    --build
        ...    shell=False    stdout=${TEMPDIR}/docker-up.log    stderr=STDOUT
        # Only show output on error
        IF    ${result.rc} != 0
            Log To Console    Docker compose failed:\n${result.stdout}
        END
    ELSE
        Log To Console    Starting all containers (this may take ~30s)...
        ${result}=    Run Process    docker    compose    -f    ${DOCKER_COMPOSE_FILE}    up    -d
        ...    shell=False    stdout=${TEMPDIR}/docker-up.log    stderr=STDOUT
        # Only show output on error
        IF    ${result.rc} != 0
            Log To Console    Docker compose failed:\n${result.stdout}
        END
    END

    Log To Console    Waiting for all services to be ready...
    Log To Console    → Checking Keycloak...
    Wait Until Keyword Succeeds    90s    5s    Check Keycloak Ready    ${KEYCLOAK_URL}
    Log To Console    → Checking Backend...
    Wait Until Keyword Succeeds    90s    5s    Check Backend Ready    ${BACKEND_URL}
    Log To Console    ✓ All test containers ready!

Stop Test Containers
    [Documentation]    Stop test containers using docker-compose
    [Arguments]    ${remove_volumes}=${False}

    IF    ${remove_volumes}
        Log To Console    Stopping containers and removing volumes...
        Run Process    docker    compose    -f    ${DOCKER_COMPOSE_FILE}    down    -v    shell=True
    ELSE
        Log To Console    Stopping containers...
        Run Process    docker    compose    -f    ${DOCKER_COMPOSE_FILE}    down    shell=True
    END

Rebuild Test Containers
    [Documentation]    Rebuild and restart test containers
    Log To Console    Rebuilding containers with latest code (this may take ~60s)...
    ${result}=    Run Process    docker    compose    -f    ${DOCKER_COMPOSE_FILE}    up    -d    --build
    ...    shell=True    stdout=${TEMPDIR}/docker-rebuild.log    stderr=STDOUT
    # Only show output on error
    IF    ${result.rc} != 0
        Log To Console    Docker compose failed:\n${result.stdout}
    END

    Log To Console    Waiting for services to be ready...
    Log To Console    → Checking Keycloak...
    Wait Until Keyword Succeeds    90s    5s    Check Keycloak Ready    ${KEYCLOAK_URL}
    Log To Console    → Checking Backend...
    Wait Until Keyword Succeeds    60s    5s    Check Backend Ready    ${BACKEND_URL}
    Log To Console    ✓ All containers rebuilt and ready!

Check All Services Ready
    [Documentation]    Check if all required test services are ready
    ...                Returns success only if Keycloak AND Backend are both healthy

    # Check Keycloak
    Log To Console    → Checking Keycloak (${KEYCLOAK_URL})...
    ${keycloak_ok}=    Run Keyword And Return Status    Check Keycloak Ready    ${KEYCLOAK_URL}
    IF    not ${keycloak_ok}
        Log To Console    ✗ Keycloak not ready
        RETURN    ${False}
    END
    Log To Console    ✓ Keycloak ready

    # Check Backend
    Log To Console    → Checking Backend (${BACKEND_URL})...
    ${backend_ok}=    Run Keyword And Return Status    Check Backend Ready    ${BACKEND_URL}
    IF    not ${backend_ok}
        Log To Console    ✗ Backend not ready
        RETURN    ${False}
    END
    Log To Console    ✓ Backend ready

    # All services ready
    RETURN    ${True}

Check Keycloak Ready
    [Documentation]    Check if Keycloak is ready
    [Arguments]    ${keycloak_url}=${KEYCLOAK_URL}

    Create Session    keycloak_check    ${keycloak_url}    verify=False    timeout=5
    ${response}=    GET On Session    keycloak_check    /realms/master    expected_status=any
    Delete All Sessions
    Should Be Equal As Integers    ${response.status_code}    200

Check Backend Ready
    [Documentation]    Check if backend is ready via health endpoint
    [Arguments]    ${backend_url}=${BACKEND_URL}

    Create Session    backend_check    ${backend_url}    verify=False    timeout=10
    ${response}=    GET On Session    backend_check    /health    expected_status=any
    Delete All Sessions
    Should Be Equal As Integers    ${response.status_code}    200

Clear Test Data
    [Documentation]    Clear test databases and data (MongoDB, Redis, etc.)
    Log To Console    Clearing test data...

    # Clear MongoDB test database
    TRY
        ${result}=    Run Process    docker    exec    ${MONGO_CONTAINER}
        ...    mongosh    --eval    db.dropDatabase()    test_db    shell=True
        Log To Console    ✓ MongoDB test database cleared
    EXCEPT
        Log To Console    ⚠ Could not clear MongoDB (container may not be running)
    END

    # Clear Redis
    TRY
        ${result}=    Run Process    docker    exec    ${REDIS_CONTAINER}
        ...    redis-cli    FLUSHALL    shell=True
        Log To Console    ✓ Redis cleared
    EXCEPT
        Log To Console    ⚠ Could not clear Redis (container may not be running)
    END

Suite Teardown
    [Documentation]    Teardown based on TEST_MODE (dev keeps containers, prod stops them)
    ${test_mode}=    Get Environment Variable    TEST_MODE    default=dev

    Run Keyword If    '${test_mode}' == 'prod'    Prod Mode Teardown
    ...    ELSE                                    Dev Mode Teardown

Dev Mode Teardown
    [Documentation]    Dev mode teardown - keep containers running for next test
    Log To Console    \n=== Dev Mode Teardown ===
    Log To Console    ✓ Keeping containers running for fast iteration
    Log To Console    Tip: Run 'make stop' in robot_tests/ to stop containers when done

Prod Mode Teardown
    [Documentation]    Prod mode teardown - stop containers and clean up
    Log To Console    \n=== Prod Mode Teardown (CI/CD) ===
    Stop Test Containers    remove_volumes=${True}
    Log To Console    ✓ Cleanup complete
