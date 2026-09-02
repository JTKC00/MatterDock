import type { QueryClient } from '@tanstack/react-query'
import type { MatterDetail } from '@shared/types'

export async function invalidateMatterLifecycleCaches(
  queryClient: QueryClient,
  matterId?: string,
  restored?: MatterDetail
): Promise<void> {
  if (matterId) {
    queryClient.removeQueries({ queryKey: ['matter', matterId] })
    queryClient.removeQueries({ queryKey: ['tasks', matterId] })
    queryClient.removeQueries({ queryKey: ['events', matterId] })
    queryClient.removeQueries({ queryKey: ['documents', matterId] })
    queryClient.removeQueries({ queryKey: ['context-preview', matterId] })
    if (restored) queryClient.setQueryData(['matter', matterId], restored)
  }
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['matters'] }),
    queryClient.invalidateQueries({ queryKey: ['today'] }),
    queryClient.invalidateQueries({ queryKey: ['waiting-board'] }),
    queryClient.invalidateQueries({ queryKey: ['search'] }),
    queryClient.invalidateQueries({ queryKey: ['tags'] }),
    queryClient.invalidateQueries({ queryKey: ['organisations'] }),
    queryClient.invalidateQueries({ queryKey: ['organisation'] }),
    queryClient.invalidateQueries({ queryKey: ['contacts'] }),
    queryClient.invalidateQueries({ queryKey: ['contact'] })
  ])
}
