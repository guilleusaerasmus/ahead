import { ApiError, type Feature } from './api';
import { PhotoError } from './image';

// YouCam error codes (see the API docs' "File Specs & Errors") mapped to advice a tired person can act on.
const MESSAGES: Record<string, string> = {
  error_hair_too_short: 'Your hair is already quite short, so the wig preview cannot work from this photo. Head coverings and brows still work.',
  error_no_shoulder: 'Please use a photo that shows your head and both shoulders.',
  error_large_face_angle: 'Please face the camera straight on, chin level.',
  error_face_pose: 'Please face the camera straight on, chin level.',
  error_insufficient_landmarks: 'We could not see your face clearly. Try a sharper photo with your whole face visible.',
  error_src_face_too_small: 'Move closer: your face should fill most of the close-up photo.',
  error_src_face_out_of_bound: 'Your face is cut off. Keep your whole face inside the photo.',
  error_lighting_dark: 'The photo is too dark. Face a window or a soft light and try again.',
  error_no_face: 'We could not find a face in this photo.',
  error_pose: 'Please face the camera straight on, chin level.',
  error_face_angle_invalid: 'Please face the camera straight on, chin level.',
  error_face_position_too_small: 'Move closer: your face should fill most of the close-up photo.',
  error_face_position_out_of_boundary: 'Your face is cut off. Keep your whole face inside the photo.',
  error_face_position_invalid: 'Centre your face in the photo and try again.',
  error_insufficient_lighting: 'The photo is too dark. Face a window or a soft light and try again.',
  error_bald_image: 'The wig preview needs a photo where some hair is visible. If you have one from before, you can use it.',
  error_multiple_people: 'Please use a photo with only you in it.',
  error_below_min_image_size: 'This photo is too small. Please use a larger one.',
  error_exceed_max_image_size: 'This photo is too large. Please try another one.',
  error_nsfw_content_detected: 'This photo could not be processed. Please use a different one.',
  visitor_budget_reached: 'You have reached today’s limit for this free demo. Your saved results are still here; please come back tomorrow.',
  daily_budget_reached: 'The free demo has reached its limit for today. Your saved results are still here; please come back tomorrow.',
  network: 'You seem to be offline. Check your connection and try again.',
  timeout: 'This is taking longer than usual. Please try again.',
  upload_failed: 'The photo did not upload. Please try again.',
};

// The hair-density analysis wants the head tilted down, so pose errors need the opposite advice.
const HAIRLINE_MESSAGES: Record<string, string> = {
  error_face_angle_invalid: 'For the hairline photo, face the camera and tilt your head down about 45° so your parting shows.',
  error_pose: 'For the hairline photo, face the camera and tilt your head down about 45° so your parting shows.',
  error_face_position_invalid: 'Keep your whole face and hairline inside the photo.',
};

export function friendlyError(e: unknown, feature?: Feature): string {
  if (e instanceof PhotoError) return e.message;
  if (e instanceof ApiError) {
    if (e.code === 'cancelled') return '';
    if (feature === 'hair-density' && HAIRLINE_MESSAGES[e.code]) return HAIRLINE_MESSAGES[e.code];
    if (e.status === 429 && !MESSAGES[e.code]) return 'The service is busy. Please wait a minute and try again.';
    return MESSAGES[e.code] ?? 'Something went wrong on our side. Please try again in a moment.';
  }
  return 'Something went wrong. Please try again.';
}
