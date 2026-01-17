*** Settings ***
Documentation    Service Configuration API keywords
...
...              Keywords for interacting with the service configuration API.
...              These handle CRUD operations on service configurations.

Library          RequestsLibrary

*** Keywords ***
Get Service Config
    [Documentation]    Get configuration for a service
    ...
    ...                Retrieves the current merged configuration for a service,
    ...                including all overrides and environment variables.
    ...
    ...                Arguments:
    ...                - session: Authenticated session alias
    ...                - service_id: ID of the service (e.g., "chronicle")
    ...
    ...                Returns: Configuration dictionary
    ...
    ...                Example:
    ...                | ${config}= | Get Service Config | admin_session | chronicle |
    ...                | Log | Database: ${config}[database] |

    [Arguments]    ${session}    ${service_id}

    ${response}=    GET On Session    ${session}
    ...             /api/settings/service-configs/${service_id}
    ...             expected_status=200

    [Return]    ${response.json()}

Update Service Config
    [Documentation]    Update configuration for a service
    ...
    ...                Updates service configuration via API. Non-secret values
    ...                go to config.overrides.yaml, secrets go to secrets.yaml.
    ...
    ...                Arguments:
    ...                - session: Authenticated session alias
    ...                - service_id: ID of the service (e.g., "chronicle")
    ...                - config_dict: Dictionary of config updates
    ...
    ...                Returns: Response JSON with success status
    ...
    ...                Example:
    ...                | ${updates}= | Create Dictionary | database=new-db |
    ...                | ${result}= | Update Service Config | admin_session | chronicle | ${updates} |
    ...                | Should Be Equal | ${result}[success] | ${True} |

    [Arguments]    ${session}    ${service_id}    ${config_dict}

    ${response}=    PUT On Session    ${session}
    ...             /api/settings/service-configs/${service_id}
    ...             json=${config_dict}
    ...             expected_status=200

    [Return]    ${response.json()}

Delete Service Config Override
    [Documentation]    Delete a specific configuration override
    ...
    ...                Removes a configuration override, reverting to default.
    ...
    ...                Arguments:
    ...                - session: Authenticated session alias
    ...                - service_id: ID of the service
    ...                - config_key: Key to delete (e.g., "database")
    ...
    ...                Returns: Response JSON
    ...
    ...                Example:
    ...                | ${result}= | Delete Service Config Override | admin_session | chronicle | database |

    [Arguments]    ${session}    ${service_id}    ${config_key}

    ${response}=    DELETE On Session    ${session}
    ...             /api/settings/service-configs/${service_id}/${config_key}
    ...             expected_status=200

    [Return]    ${response.json()}
