#!/usr/bin/env python3
"""
Audio transcription script using OpenAI Whisper.
Provides accurate speech-to-text for Portuguese (BR) with timestamps.
"""

import argparse
import os
import sys
from pathlib import Path

try:
    import whisper
except ImportError:
    print("Error: openai-whisper not installed. Run: pip install openai-whisper", file=sys.stderr)
    sys.exit(1)

SUPPORTED_FORMATS = {'.mp3', '.wav', '.ogg', '.flac', '.m4a', '.opus', '.webm', '.mp4', '.mpeg', '.mpga', '.wma'}


def format_timestamp(seconds: float) -> str:
    """Convert seconds to MM:SS.ms format."""
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    ms = int((seconds % 1) * 100)
    return f"{mins:02d}:{secs:02d}.{ms:02d}"


def transcribe_file(model, audio_path: Path, output_dir: Path) -> None:
    """Transcribe a single audio file and save the result."""
    print(f"Transcribing: {audio_path}")

    result = model.transcribe(
        str(audio_path),
        language="pt",  # Portuguese
        task="transcribe",
        verbose=False,
    )

    output_file = output_dir / f"{audio_path.stem}.txt"

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"Transcription of: {audio_path.name}\n")
        f.write("=" * 50 + "\n\n")

        # Write segments with timestamps
        for segment in result.get("segments", []):
            start = format_timestamp(segment["start"])
            end = format_timestamp(segment["end"])
            text = segment["text"].strip()
            f.write(f"[{start} -> {end}]\n")
            f.write(f"{text}\n\n")

        f.write("=" * 50 + "\n")
        f.write("FULL TEXT:\n")
        f.write("=" * 50 + "\n")
        f.write(result["text"])

    print(f"  -> Saved: {output_file}")


def process_directory(model, input_dir: Path, output_dir: Path) -> None:
    """Recursively process all audio files in a directory."""
    output_dir.mkdir(parents=True, exist_ok=True)

    for entry in input_dir.iterdir():
        if entry.is_dir():
            sub_output = output_dir / entry.name
            process_directory(model, entry, sub_output)
        elif entry.is_file() and entry.suffix.lower() in SUPPORTED_FORMATS:
            try:
                transcribe_file(model, entry, output_dir)
            except Exception as e:
                print(f"Error transcribing {entry}: {e}", file=sys.stderr)
        elif entry.name == '.gitkeep':
            pass  # Ignore .gitkeep files
        elif entry.is_file():
            print(f"Skipping unsupported file: {entry.name}")


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio files to text using Whisper")
    parser.add_argument("input_dir", help="Input directory containing audio files")
    parser.add_argument("output_dir", help="Output directory for transcription files")
    parser.add_argument(
        "--model",
        default="large-v3-turbo",
        choices=["tiny", "base", "small", "medium", "large", "large-v2", "large-v3", "large-v3-turbo", "turbo"],
        help="Whisper model size (default: large-v3-turbo for best Portuguese accuracy)"
    )

    args = parser.parse_args()

    input_path = Path(args.input_dir).resolve()
    output_path = Path(args.output_dir).resolve()

    if not input_path.exists():
        print(f"Error: Input directory does not exist: {input_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Loading Whisper model '{args.model}' (this may take a while on first run)...")
    model = whisper.load_model(args.model)
    print("Model loaded. Starting transcription...\n")

    process_directory(model, input_path, output_path)

    print("\nAll audio files transcribed.")


if __name__ == "__main__":
    main()
