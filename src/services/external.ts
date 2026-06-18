export default {
  async ping() {
    // Simple external service health check – always succeed for now
    return true;
  },
  async initialize() {
    // Placeholder external service initialization
    return true;
  },
};
