/**
 * Type declarations for react-native-base64
 */
declare module 'react-native-base64' {
  const base64: {
    encode(input: string): string;
    decode(input: string): string;
  };
  export default base64;
}
