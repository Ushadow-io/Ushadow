*** Settings ***
Documentation    Legacy API keywords file - DEPRECATED
...
...              ⚠️  This file is maintained for backward compatibility only.
...              ⚠️  For new tests, import specific resource files instead:
...
...              - auth_keywords.robot           (Authentication)
...              - service_config_keywords.robot (Service config API)
...              - config_file_keywords.robot    (Config file operations)
...              - file_keywords.robot           (File backup/restore)
...              - service_keywords.robot        (Service management)
...
...              See KEYWORD_INDEX.md for full keyword reference.
...
...              This file re-exports all keywords from the organized files
...              so existing tests continue to work without modification.

# Import all focused keyword files
Resource    auth_keywords.robot
Resource    service_config_keywords.robot
Resource    config_file_keywords.robot
Resource    file_keywords.robot
Resource    service_keywords.robot

# All keywords are now available through imports
# No additional keywords defined here
