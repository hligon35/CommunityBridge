import { Platform, useWindowDimensions } from 'react-native';

export default function useIsTabletLayout() {
  const { width } = useWindowDimensions();
  const isPad = Platform.OS === 'ios' && Platform.isPad;
  return Boolean(isPad || width >= 1024 || (Platform.OS === 'web' && width >= 900));
}