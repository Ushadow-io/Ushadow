*** Settings ***
Documentation    Service Management keywords
...
...              Keywords for managing services via the Docker API.
...              These handle service lifecycle (start, stop, status)
...              and service inspection (environment, health).

Library          RequestsLibrary

*** Keywords ***
Start Service
    [Documentation]    Start a service using the Docker API
    ...
    ...                Starts a Docker service. Use this to verify that services
    ...                start correctly with configuration changes.
    ...
    ...                Arguments:
    ...                - session: Authenticated session alias
    ...                - service_name: Name of the service to start
    ...
    ...                Returns: Response object (check status_code for success)
    ...
    ...                Example:
    ...                | ${response}= | Start Service | admin_session | chronicle |
    ...                | Should Be Equal As Integers | ${response.status_code} | 200 |

    [Arguments]    ${session}    ${service_name}

    ${response}=    POST On Session    ${session}
    ...             /api/docker/services/${service_name}/start
    ...             expected_status=any

    [Return]    ${response}

Stop Service
    [Documentation]    Stop a service using the Docker API
    ...
    ...                Stops a running Docker service.
    ...
    ...                Arguments:
    ...                - session: Authenticated session alias
    ...                - service_name: Name of the service to stop
    ...
    ...                Returns: Response object
    ...
    ...                Example:
    ...                | ${response}= | Stop Service | admin_session | chronicle |

    [Arguments]    ${session}    ${service_name}

    ${response}=    POST On Session    ${session}
    ...             /api/docker/services/${service_name}/stop
    ...             expected_status=any

    [Return]    ${response}

Get Service Status
    [Documentation]    Get current status of a service
    ...
    ...                Retrieves detailed service information including status,
    ...                environment variables, health checks, etc.
    ...
    ...                Arguments:
    ...                - session: Authenticated session alias
    ...                - service_name: Name of the service
    ...
    ...                Returns: Service info dictionary
    ...
    ...                Example:
    ...                | ${info}= | Get Service Status | admin_session | chronicle |
    ...                | Log | Status: ${info}[status] |

    [Arguments]    ${session}    ${service_name}

    ${response}=    GET On Session    ${session}
    ...             /api/docker/services/${service_name}
    ...             expected_status=200

    [Return]    ${response.json()}

Get Service Environment Variables
    [Documentation]    Get environment variables for a running service
    ...
    ...                Retrieves the environment variables that the service
    ...                is currently running with.
    ...
    ...                Arguments:
    ...                - session: Authenticated session alias
    ...                - service_name: Name of the service
    ...
    ...                Returns: Dictionary of environment variables
    ...
    ...                Example:
    ...                | ${env}= | Get Service Environment Variables | admin_session | chronicle |
    ...                | Log | Database: ${env}[MONGODB_DATABASE] |

    [Arguments]    ${session}    ${service_name}

    ${response}=    GET On Session    ${session}
    ...             /api/docker/services/${service_name}
    ...             expected_status=200

    ${env_vars}=    Set Variable    ${response.json()}[environment]
    [Return]    ${env_vars}

Get Container Environment
    [Documentation]    Get actual environment variables from a running container
    ...
    ...                Inspects the Docker container to retrieve the env vars
    ...                that were actually passed at startup. This is useful for
    ...                verifying that configured values are deployed correctly.
    ...
    ...                Arguments:
    ...                - session: Authenticated session alias
    ...                - service_name: Name of the service
    ...                - unmask: If True, return unmasked values (default: False)
    ...
    ...                Returns: Dictionary with success, env_vars, container_found
    ...
    ...                Example:
    ...                | ${result}= | Get Container Environment | admin_session | chronicle-backend |
    ...                | Log | Model: ${result}[env_vars][OPENAI_MODEL] |

    [Arguments]    ${session}    ${service_name}    ${unmask}=${False}

    ${params}=    Create Dictionary    unmask=${unmask}
    ${response}=    GET On Session    ${session}
    ...             /api/services/${service_name}/container-env
    ...             params=${params}
    ...             expected_status=200

    [Return]    ${response.json()}

Wait For Service To Be Ready
    [Documentation]    Wait for service to reach ready state
    ...
    ...                Polls service status until it's ready or timeout occurs.
    ...
    ...                Arguments:
    ...                - session: Authenticated session alias
    ...                - service_name: Name of the service
    ...                - timeout: Max wait time in seconds (default: 60)
    ...                - interval: Poll interval in seconds (default: 2)
    ...
    ...                Example:
    ...                | Start Service | admin_session | chronicle |
    ...                | Wait For Service To Be Ready | admin_session | chronicle | timeout=30 |

    [Arguments]    ${session}    ${service_name}    ${timeout}=60    ${interval}=2

    ${start_time}=    Get Time    epoch
    ${timeout_int}=   Convert To Integer    ${timeout}
    ${interval_int}=  Convert To Integer    ${interval}

    WHILE    True    limit=${timeout_int}
        ${info}=    Get Service Status    ${session}    ${service_name}
        ${status}=  Get From Dictionary    ${info}    status    default=unknown

        # Check if service is ready
        ${is_ready}=    Run Keyword And Return Status
        ...    Should Be Equal    ${status}    running

        Return From Keyword If    ${is_ready}

        # Wait before next check
        Sleep    ${interval}s

        # Check timeout
        ${current_time}=    Get Time    epoch
        ${elapsed}=    Evaluate    ${current_time} - ${start_time}
        Run Keyword If    ${elapsed} > ${timeout_int}
        ...    Fail    Service ${service_name} did not become ready within ${timeout}s
    END

Restart Service
    [Documentation]    Restart a service (stop then start)
    ...
    ...                Convenience keyword that stops and starts a service.
    ...
    ...                Arguments:
    ...                - session: Authenticated session alias
    ...                - service_name: Name of the service
    ...                - wait_ready: Whether to wait for service to be ready (default: True)
    ...
    ...                Example:
    ...                | Restart Service | admin_session | chronicle |

    [Arguments]    ${session}    ${service_name}    ${wait_ready}=${True}

    # Stop service
    ${stop_response}=    Stop Service    ${session}    ${service_name}
    Sleep    2s    # Give service time to stop

    # Start service
    ${start_response}=    Start Service    ${session}    ${service_name}

    # Wait for ready if requested
    Run Keyword If    ${wait_ready}
    ...    Wait For Service To Be Ready    ${session}    ${service_name}
