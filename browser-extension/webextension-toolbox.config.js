module.exports = {
  // webpack 配置覆盖
  webpack: (config, { dev, vendor }) => {
    // 找到 WebextensionPlugin 并禁用 manifest 验证
    const webextensionPlugin = config.plugins.find(
      plugin => plugin.constructor.name === 'WebextensionPlugin'
    );

    if (webextensionPlugin) {
      // 禁用验证
      webextensionPlugin.options = {
        ...webextensionPlugin.options,
        skipManifestValidation: true
      };
    }

    // 返回修改后的配置
    return config;
  }
};
