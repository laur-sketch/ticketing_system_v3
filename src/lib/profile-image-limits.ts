/** Max decoded image size for profile uploads (bytes). */
export const MAX_PROFILE_IMAGE_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Max length of a `data:image/...;base64,...` payload we accept (base64 expands ~4/3, plus prefix).
 * Keeps client `File.size` and server data-URL checks aligned.
 */
export const MAX_PROFILE_IMAGE_DATA_URL_CHARS = Math.ceil(MAX_PROFILE_IMAGE_FILE_BYTES / 3) * 4 + 128;
