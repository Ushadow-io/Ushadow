/**
 * Tab Layout for Ushadow Mobile
 *
 * Bottom tab navigation with Home, Conversations, and Memories tabs.
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
        tabBarItemStyle: {
          flex: 1, // Equal width for all tabs
        },
        tabBarIconStyle: {
          marginBottom: -3, // Consistent vertical spacing
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
        name="conversations"
        options={{
          title: 'Conversations',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
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
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'chatbox' : 'chatbox-outline'}
              size={size}
              color={color}
              testID="tab-icon-chat"
            />
          ),
          tabBarAccessibilityLabel: 'Chat Tab',
        }}
      />
    </Tabs>
  );
}
