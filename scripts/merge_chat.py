#!/usr/bin/env python3
"""
Merges WhatsApp chat export with audio transcriptions.
Replaces audio file references with actual transcribed content.
"""

import re
import sys
from pathlib import Path


def extract_full_text(transcription_path: Path) -> str:
    """Extract only the FULL TEXT section from a transcription file."""
    content = transcription_path.read_text(encoding='utf-8')

    # Find the FULL TEXT section
    marker = "FULL TEXT:\n" + "=" * 50 + "\n"
    if marker in content:
        return content.split(marker)[1].strip()

    # Fallback: return everything after the header
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if line.startswith('=') and i > 0:
            return '\n'.join(lines[i+1:]).strip()

    return content


def clean_text(text: str) -> str:
    """Remove invisible Unicode characters from WhatsApp exports."""
    # Remove left-to-right mark, zero-width spaces, and other invisible chars
    invisible_chars = [
        '\u200e',  # Left-to-right mark
        '\u200f',  # Right-to-left mark
        '\u200b',  # Zero-width space
        '\u200c',  # Zero-width non-joiner
        '\u200d',  # Zero-width joiner
        '\ufeff',  # Byte order mark
        '\u202a',  # Left-to-right embedding
        '\u202b',  # Right-to-left embedding
        '\u202c',  # Pop directional formatting
        '\u2066',  # Left-to-right isolate
        '\u2067',  # Right-to-left isolate
        '\u2068',  # First strong isolate
        '\u2069',  # Pop directional isolate
    ]
    for char in invisible_chars:
        text = text.replace(char, '')
    return text


def merge_chat_with_transcriptions(chat_path: Path, transcriptions_dir: Path, output_path: Path):
    """Merge chat with audio transcriptions."""

    chat_content = chat_path.read_text(encoding='utf-8')
    chat_content = clean_text(chat_content)
    lines = chat_content.split('\n')

    # Pattern to match audio attachments
    audio_pattern = re.compile(r'<attached: (\d+-AUDIO-[\d-]+\.opus)>')

    output_lines = []

    for line in lines:
        match = audio_pattern.search(line)
        if match:
            audio_filename = match.group(1)
            transcription_filename = audio_filename.replace('.opus', '.txt')
            transcription_path = transcriptions_dir / transcription_filename

            if transcription_path.exists():
                # Get the transcribed text
                transcribed_text = extract_full_text(transcription_path)

                # Replace the attachment reference with the transcription
                # Keep the timestamp and sender, replace the attachment part
                new_line = line.replace(f'<attached: {audio_filename}>', '')
                new_line = new_line.rstrip('‎ ')  # Remove trailing special chars

                # Add the transcribed content
                output_lines.append(new_line)
                output_lines.append(f'    [AUDIO] {transcribed_text}')
            else:
                # Keep original line if transcription not found
                output_lines.append(line + ' [TRANSCRIPTION NOT FOUND]')
        else:
            output_lines.append(line)

    # Write output
    output_path.write_text('\n'.join(output_lines), encoding='utf-8')
    print(f"Document saved to: {output_path}")


def main():
    if len(sys.argv) < 4:
        print("Usage: python merge_chat.py <chat_file> <transcriptions_dir> <output_file>")
        sys.exit(1)

    chat_path = Path(sys.argv[1])
    transcriptions_dir = Path(sys.argv[2])
    output_path = Path(sys.argv[3])

    if not chat_path.exists():
        print(f"Error: Chat file not found: {chat_path}")
        sys.exit(1)

    if not transcriptions_dir.exists():
        print(f"Error: Transcriptions directory not found: {transcriptions_dir}")
        sys.exit(1)

    merge_chat_with_transcriptions(chat_path, transcriptions_dir, output_path)


if __name__ == "__main__":
    main()
