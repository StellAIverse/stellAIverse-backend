// src/plugins/plugin.audit.ts

export const auditLog = (action: string, pluginId: string) => {
  console.log(
    `[PLUGIN AUDIT] ${action} - ${pluginId} - ${new Date().toISOString()}`,
  );
};
