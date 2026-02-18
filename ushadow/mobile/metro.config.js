// Learn more: https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Suppress route warnings for non-route files
config.resolver = {
  ...config.resolver,
  sourceExts: [...(config.resolver?.sourceExts || []), 'ts', 'tsx'],
};

// Configure expo-router to ignore utility directories
config.watchFolders = [__dirname];

module.exports = config;
