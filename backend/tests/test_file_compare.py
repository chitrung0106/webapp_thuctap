from app.services.file_compare import compare_text


def test_compare_text_returns_missing_lines_and_counts_duplicates() -> None:
    result = compare_text("alpha\nbeta\nbeta\n", "alpha\nbeta\n")

    assert result == {
        "input_count": 3,
        "output_count": 2,
        "missing_count": 1,
        "missing_lines": [{"line": "beta", "count": 1}],
    }


def test_compare_text_ignores_blank_lines_and_surrounding_whitespace() -> None:
    result = compare_text("  alpha  \n\n beta\n", "alpha\nbeta\n")

    assert result["input_count"] == 2
    assert result["missing_count"] == 0


def test_compare_text_handles_utf8_bom() -> None:
    result = compare_text("\ufeffalpha\n", "alpha\n")

    assert result["missing_count"] == 0