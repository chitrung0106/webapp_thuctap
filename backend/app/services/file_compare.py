from collections import Counter


def _records(text: str) -> list[str]:
    lines = text.removeprefix("\ufeff").splitlines()
    return [line.strip() for line in lines if line.strip()]


def compare_text(input_text: str, output_text: str) -> dict:
    input_lines = _records(input_text)
    output_lines = _records(output_text)
    missing_counts = Counter(input_lines) - Counter(output_lines)

    return {
        "input_count": len(input_lines),
        "output_count": len(output_lines),
        "missing_count": sum(missing_counts.values()),
        "missing_lines": [
            {"line": line, "count": count}
            for line, count in missing_counts.items()
        ],
    }