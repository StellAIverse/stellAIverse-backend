// plugins/sample.plugin.ts

export default {
  metadata: {
    name: "Sample AI Plugin",
    version: "1.0",
    author: "OSS",
    description: "Demo plugin",
    capabilities: ["ai"],
  },

  async onExecute(input: any) {
    return { message: "Hello from plugin", input };
  },
};
