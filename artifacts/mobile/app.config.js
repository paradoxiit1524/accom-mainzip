const PROD_API = process.env.EXPO_PUBLIC_API_URL || "https://3ebd7d0b-cc28-4774-850d-4eac0c847cd3-00-3p6ry8rmt634z.sisko.replit.dev/api";

module.exports = function applyAppConfig({ config }) {
  const proxyUrl = process.env.EXPO_PUBLIC_WEB_ORIGIN || "https://localhost";

  return {
    ...config,
    plugins: (config.plugins || []).map((plugin) => {
      if (Array.isArray(plugin) && plugin[0] === "expo-router") {
        return [plugin[0], { ...plugin[1], origin: proxyUrl }];
      }
      return plugin;
    }),
    extra: {
      ...config.extra,
      apiUrl: PROD_API,
      router: {
        ...config.extra?.router,
        origin: proxyUrl,
        headOrigin: proxyUrl,
      },
    },
  };
};
