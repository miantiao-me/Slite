defineRouteMeta({
  openAPI: {
    description: 'Manually trigger a backup to private local storage',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async () => {
  await backupLinksToDisk(true)

  return {
    success: true,
    message: 'Backup completed successfully',
  }
})
