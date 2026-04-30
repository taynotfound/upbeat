import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarInactiveTintColor: '#8f7c9f',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#100713',
          borderTopColor: '#2f1e32',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Live',
          tabBarIcon: ({ color }) => <MaterialIcons size={28} name="graphic-eq" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color }) => <MaterialIcons size={28} name="event-note" color={color} />,
        }}
      />
    </Tabs>
  );
}
