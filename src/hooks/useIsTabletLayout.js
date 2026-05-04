import { Platform, useWindowDimensions } from 'react-native';

export default function useIsTabletLayout() {
  const { width, height } = useWindowDimensions();
  const isPad = Platform.OS === 'ios' && Platform.isPad;
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const isLandscapePhoneWorkspace = width > height && longEdge >= 640 && shortEdge >= 360;
  return Boolean(isPad || width >= 1024 || (Platform.OS === 'web' && width >= 900) || isLandscapePhoneWorkspace);
}