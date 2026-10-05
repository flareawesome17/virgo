/**
 * useOffline Hook
 *
 * Provides offline status for the app.
 */

import { useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { onlineManager } from '@tanstack/react-query'

export function useOffline() {
  const [isOffline, setIsOffline] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // Null is "not checked yet", not "no". Read as offline, the app flashed
      // "couldn't load" at launch, before the first check had answered.
      const online = state.isConnected !== false && state.isInternetReachable !== false
      setIsOffline(!online)
      onlineManager.setOnline(online)

      if (online) {
        setLastSyncTime(new Date())
      }
    })

    return () => unsubscribe()
  }, [])

  return { isOffline, lastSyncTime }
}
