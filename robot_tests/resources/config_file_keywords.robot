*** Settings ***
Documentation    Configuration File keywords
...
...              Keywords for reading, parsing, and working with configuration
...              files (YAML format). Use these for verifying config writes
...              and loading test fixtures.

Library          OperatingSystem

*** Keywords ***
Read Config File
    [Documentation]    Read and parse a YAML config file
    ...
    ...                Reads a YAML configuration file and returns parsed data.
    ...                Returns None if file doesn't exist.
    ...
    ...                Arguments:
    ...                - file_path: Absolute path to YAML file
    ...
    ...                Returns: Parsed YAML as dictionary/list, or None if not found
    ...
    ...                Example:
    ...                | ${config}= | Read Config File | ${CONFIG_DIR}/config.defaults.yaml |
    ...                | Should Be Equal | ${config}[database] | ushadow |

    [Arguments]    ${file_path}

    ${exists}=    Run Keyword And Return Status    File Should Exist    ${file_path}
    Return From Keyword If    not ${exists}    ${None}

    ${content}=    Get File    ${file_path}
    ${yaml}=       Evaluate    __import__('yaml').safe_load('''${content}''')    modules=yaml

    [Return]    ${yaml}

Load YAML File
    [Documentation]    Load and parse a YAML file (fails if not found)
    ...
    ...                Loads a YAML file and returns parsed data.
    ...                Unlike Read Config File, this FAILS if file doesn't exist.
    ...                Use this for loading test fixtures.
    ...
    ...                Arguments:
    ...                - file_path: Absolute path to YAML file
    ...
    ...                Returns: Parsed YAML as dictionary/list
    ...
    ...                Example:
    ...                | ${fixture}= | Load YAML File | ${FIXTURES_DIR}/configs/test_config.yaml |
    ...                | Update Service Config | session | chronicle | ${fixture} |

    [Arguments]    ${file_path}

    File Should Exist    ${file_path}
    ...    msg=Test fixture file not found: ${file_path}

    ${content}=    Get File    ${file_path}
    ${data}=       Evaluate    __import__('yaml').safe_load('''${content}''')    modules=yaml

    [Return]    ${data}

Write YAML File
    [Documentation]    Write data structure to YAML file
    ...
    ...                Serializes a dictionary/list to YAML format and writes to file.
    ...
    ...                Arguments:
    ...                - file_path: Path where to write file
    ...                - data: Dictionary or list to serialize
    ...
    ...                Example:
    ...                | ${config}= | Create Dictionary | database=test-db | model=gpt-4 |
    ...                | Write YAML File | ${OUTPUT_DIR}/test.yaml | ${config} |

    [Arguments]    ${file_path}    ${data}

    ${yaml_str}=    Evaluate    __import__('yaml').dump($data, default_flow_style=False)    modules=yaml
    Create File    ${file_path}    ${yaml_str}

Verify Config File Contains
    [Documentation]    Verify a config file contains expected key-value pairs
    ...
    ...                Checks that a YAML config file contains specific values.
    ...                Useful for verifying config writes.
    ...
    ...                Arguments:
    ...                - file_path: Path to YAML config file
    ...                - section: Section path (e.g., "service_preferences.chronicle")
    ...                - expected_values: Dictionary of expected key-value pairs
    ...
    ...                Example:
    ...                | ${expected}= | Create Dictionary | database=test-db |
    ...                | Verify Config File Contains | ${OVERRIDES_FILE} | service_preferences.chronicle | ${expected} |

    [Arguments]    ${file_path}    ${section}    ${expected_values}

    ${config}=    Load YAML File    ${file_path}

    # Navigate to section (e.g., "service_preferences.chronicle" -> config[service_preferences][chronicle])
    ${section_data}=    Set Variable    ${config}
    @{section_keys}=    Split String    ${section}    .

    FOR    ${key}    IN    @{section_keys}
        ${section_data}=    Get From Dictionary    ${section_data}    ${key}
    END

    # Verify each expected value
    FOR    ${key}    ${expected_value}    IN    &{expected_values}
        Dictionary Should Contain Key    ${section_data}    ${key}
        ...    msg=Config section '${section}' should contain key '${key}'
        Should Be Equal    ${section_data}[${key}]    ${expected_value}
        ...    msg=${section}.${key} should be '${expected_value}', got '${section_data}[${key}]'
    END
