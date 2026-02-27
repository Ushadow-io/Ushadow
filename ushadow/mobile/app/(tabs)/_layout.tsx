/**
 * Tab Layout for Ushadow Mobile
 *
 * Bottom tab navigation with Home, Chat, Feed, History, and Memories tabs.
 * Uses safe area insets to avoid being cut off by home indicator.
 */

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, colors } from '../theme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.backgroundCard,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          // Use safe area bottom inset + padding for proper spacing
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary[400],
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={size}
              color={color}
              testID="tab-icon-home"
            />
          ),
          tabBarAccessibilityLabel: 'Home Tab',
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
              size={size}
              color={color}
              testID="tab-icon-chat"
            />
          ),
          tabBarAccessibilityLabel: 'Chat Tab',
        }}
      />
      <Tabs.Screen
        name="feeds"
        options={{
          title: 'Feed',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'newspaper' : 'newspaper-outline'}
              size={size}
              color={color}
              testID="tab-icon-feeds"
            />
          ),
          tabBarAccessibilityLabel: 'Feed Tab',
        }}
      />
      <Tabs.Screen
        name="conversations"
        options={{
          title: 'History',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'time' : 'time-outline'}
              size={size}
              color={color}
              testID="tab-icon-conversations"
            />
          ),
          tabBarAccessibilityLabel: 'Conversations Tab',
        }}
      />
      <Tabs.Screen
        name="memories"
        options={{
          title: 'Memories',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'bulb' : 'bulb-outline'}
              size={size}
              color={color}
              testID="tab-icon-memories"
            />
          ),
          tabBarAccessibilityLabel: 'Memories Tab',
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'radio' : 'radio-outline'}
              size={size}
              color={color}
              testID="tab-icon-feed"
            />
          ),
          tabBarAccessibilityLabel: 'Feed Tab',
        }}
      />
      {/* Sessions page is accessible via Connection Logs modal (home screen header) */}
      <Tabs.Screen
        name="sessions"
        options={{ href: null }}
      />
    </Tabs>
  );
}
