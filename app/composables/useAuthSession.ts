import type { AuthMethod, VerifyResponse } from '@/types'
import { readonly, useState } from '#imports'

export function useAuthSession() {
  const authMethod = useState<AuthMethod | null>('auth-method', () => null)
  const userID = useState<string | null>('user-id', () => null)
  const userEmail = useState<string | null>('user-email', () => null)

  function setAuthSession(response: VerifyResponse) {
    authMethod.value = response.authMethod
    userID.value = response.userID
    userEmail.value = response.userEmail
  }

  function clearAuthSession() {
    authMethod.value = null
    userID.value = null
    userEmail.value = null
  }

  return {
    authMethod: readonly(authMethod),
    userID: readonly(userID),
    userEmail: readonly(userEmail),
    setAuthSession,
    clearAuthSession,
  }
}
