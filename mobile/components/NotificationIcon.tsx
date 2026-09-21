import { View } from 'react-native';
import { CATEGORY_OF_TOPIC, type NotificationTopic } from '@/src/api';
import { tintFor, topicIcon } from '@/src/lib/notification-topics';
import type { Palette } from '@/theme';

/**
 * The round icon a notification is drawn with, tinted by its kind.
 *
 * The icon takes its colour as a prop rather than a className: lucide on
 * native gives `color` to the stroke alone, and a class-driven colour would
 * need cssInterop registered for every icon in the table.
 */
export function NotificationIcon({
  topic,
  palette,
  size = 36,
}: {
  topic: NotificationTopic;
  palette: Palette;
  size?: number;
}) {
  const Icon = topicIcon(topic);
  const tint = tintFor(CATEGORY_OF_TOPIC[topic], palette);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${tint}1F`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={Math.round(size * 0.47)} color={tint} />
    </View>
  );
}
