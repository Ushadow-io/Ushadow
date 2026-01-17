*** Settings ***
Documentation    File Management keywords
...
...              Keywords for backing up, restoring, and managing files
...              during test execution. Use these in Suite Setup/Teardown
...              to ensure clean test state.

Library          OperatingSystem

*** Keywords ***
Backup Config Files
    [Documentation]    Backup config files before tests
    ...
    ...                Creates .backup copies of specified files if they exist.
    ...                Safe to call even if files don't exist.
    ...
    ...                Arguments:
    ...                - file_paths: One or more file paths to backup
    ...
    ...                Example:
    ...                | Backup Config Files | ${OVERRIDES_FILE} | ${SECRETS_FILE} |

    [Arguments]    @{file_paths}

    FOR    ${file_path}    IN    @{file_paths}
        ${exists}=    Run Keyword And Return Status    File Should Exist    ${file_path}
        Run Keyword If    ${exists}    Copy File    ${file_path}    ${file_path}.backup
        Run Keyword If    ${exists}    Log    Backed up: ${file_path}
    END

Restore Config Files
    [Documentation]    Restore config files after tests
    ...
    ...                Restores files from .backup copies and cleans up.
    ...                If backup exists, restores it. If file was created during
    ...                test but no backup exists, removes the file.
    ...
    ...                Arguments:
    ...                - file_paths: One or more file paths to restore
    ...
    ...                Example:
    ...                | Restore Config Files | ${OVERRIDES_FILE} | ${SECRETS_FILE} |

    [Arguments]    @{file_paths}

    FOR    ${file_path}    IN    @{file_paths}
        ${backup_exists}=    Run Keyword And Return Status    File Should Exist    ${file_path}.backup

        # If backup exists, restore it
        Run Keyword If    ${backup_exists}    Move File    ${file_path}.backup    ${file_path}
        Run Keyword If    ${backup_exists}    Log    Restored: ${file_path}

        # If no backup but file exists, it was created by test - remove it
        Run Keyword If    not ${backup_exists}
        ...    Run Keyword And Ignore Error
        ...    Remove File    ${file_path}
    END

Clean Directory
    [Documentation]    Remove all files matching pattern from directory
    ...
    ...                Useful for cleaning up test output files.
    ...
    ...                Arguments:
    ...                - directory: Directory to clean
    ...                - pattern: File pattern (e.g., "*.log", "test-*")
    ...
    ...                Example:
    ...                | Clean Directory | ${OUTPUT_DIR} | *.tmp |

    [Arguments]    ${directory}    ${pattern}=*

    ${files}=    List Files In Directory    ${directory}    ${pattern}

    FOR    ${file}    IN    @{files}
        Remove File    ${directory}/${file}
    END

    Log    Cleaned ${directory}: removed ${files.__len__()} files matching '${pattern}'

Ensure Directory Exists
    [Documentation]    Create directory if it doesn't exist
    ...
    ...                Safe to call multiple times - won't fail if directory exists.
    ...
    ...                Arguments:
    ...                - directory_path: Path to directory
    ...
    ...                Example:
    ...                | Ensure Directory Exists | ${OUTPUT_DIR}/test-results |

    [Arguments]    ${directory_path}

    ${exists}=    Run Keyword And Return Status    Directory Should Exist    ${directory_path}
    Run Keyword Unless    ${exists}    Create Directory    ${directory_path}

Create Temporary File
    [Documentation]    Create a temporary file with content
    ...
    ...                Creates a file in system temp directory. Returns path.
    ...                Useful for testing file uploads or config changes.
    ...
    ...                Arguments:
    ...                - content: File content
    ...                - extension: File extension (default: .txt)
    ...
    ...                Returns: Path to created file
    ...
    ...                Example:
    ...                | ${temp_file}= | Create Temporary File | test data | .yaml |
    ...                | Load YAML File | ${temp_file} |

    [Arguments]    ${content}    ${extension}=.txt

    ${timestamp}=    Get Time    epoch
    ${temp_file}=    Set Variable    /tmp/robot_test_${timestamp}${extension}

    Create File    ${temp_file}    ${content}
    Log    Created temporary file: ${temp_file}

    [Return]    ${temp_file}
