# Test Fixtures

This directory contains test data used by Robot Framework tests.

## Directory Structure

```
fixtures/
├── configs/              # Service configuration fixtures
│   ├── minimal_chronicle_config.yaml
│   └── full_service_config.yaml
└── responses/            # Mock API response fixtures
    └── llm_success_response.json
```

## Usage in Tests

### Loading YAML Configuration

```robot
*** Test Cases ***
Test With Fixture Config
    ${test_config}=    Load YAML File    ${FIXTURES_DIR}/configs/minimal_chronicle_config.yaml
    Update Service Config    admin_session    chronicle    ${test_config}
```

### Loading JSON Response Data

```robot
*** Test Cases ***
Test With Mock LLM Response
    ${mock_response}=    Get File    ${FIXTURES_DIR}/responses/llm_success_response.json
    ${response_json}=    Evaluate    __import__('json').loads('''${mock_response}''')

    # Use in mock server setup
    Configure Mock Endpoint    POST    /v1/chat/completions
    ...    response_body=${response_json}
    ...    status_code=200
```

### Using Variables from Fixtures

You can also import fixtures as Robot Framework variables:

```robot
*** Settings ***
Variables    ../fixtures/configs/minimal_chronicle_config.yaml

*** Test Cases ***
Test With Static Variables
    # Variables from YAML are automatically available
    Log    Using database: ${database}
    Log    Using model: ${llm_model}
```

## Adding New Fixtures

### Configuration Fixtures

Create YAML files in `configs/` for service configuration test data:

```yaml
# configs/my_test_config.yaml
database: test-db
llm_model: gpt-4
setting_name: setting_value
```

### Response Fixtures

Create JSON files in `responses/` for mock API responses:

```json
{
  "status": "success",
  "data": {
    "key": "value"
  }
}
```

## Best Practices

1. **Keep fixtures minimal** - Only include data needed for the test
2. **Use descriptive names** - Name fixtures after what they test
3. **Don't hardcode sensitive data** - Use obviously fake credentials
4. **Version fixtures** - If API changes, keep old fixtures for backwards compatibility tests
5. **Document edge cases** - Add comments explaining why unusual data exists

## Examples

### Minimal vs Full Config

- `minimal_chronicle_config.yaml` - Tests service can start with minimum fields
- `full_service_config.yaml` - Tests service handles all optional fields

### Success vs Error Responses

- `llm_success_response.json` - Normal successful LLM API response
- `llm_error_response.json` - Error response for testing error handling

### Valid vs Invalid Data

- `valid_user_data.yaml` - Correctly formatted user data
- `invalid_user_data.yaml` - Malformed data for validation testing
