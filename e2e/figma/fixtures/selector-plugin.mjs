export default {
  name: 'figma-smoke-selector',
  version: '1.0.0',
  async resolve() {
    return {
      selector: '#composite',
      stabilityScore: 100,
      reasons: ['Resolved by the deterministic Figma smoke fixture plugin'],
    };
  },
};
