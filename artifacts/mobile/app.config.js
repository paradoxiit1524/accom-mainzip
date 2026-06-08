const PROD_API = process.env.EXPO_PUBLIC_API_URL || "https://8fcc98ef-c551-4cec-a19b-a551adba3e94-00-2b9md7n83ykc3.pike.replit.dev/api";

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
