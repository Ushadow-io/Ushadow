export interface User {
  id: string
  name: string
  email: string
  is_superuser: boolean
  api_key?: string
  api_key_created_at?: string
}
