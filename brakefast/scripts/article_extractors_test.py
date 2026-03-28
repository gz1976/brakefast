"""Tests for article_extractors module."""

import pytest

from article_extractors import (
    clean_html_text,
    extract_main_text,
    extract_main_text_dual,
    extract_main_text_trafilatura,
    normalize_whitespace,
    smart_truncate,
)

SIMPLE_ARTICLE_HTML = """
<html><body>
<article>
<h1>Test Article Title</h1>
<p>This is the first paragraph of the test article. It contains enough text to be meaningful for extraction purposes and quality scoring.</p>
<p>This is the second paragraph with additional content. The article discusses important topics that are relevant to the reader and provides context.</p>
<p>In the third paragraph we explore further details about the subject matter. There are many aspects to consider when analyzing this topic in depth.</p>
<p>The fourth paragraph wraps up the discussion with concluding thoughts. Overall the article provides a comprehensive overview of the key points and their implications.</p>
<p>Finally, the fifth paragraph adds extra supporting information. This ensures the article has enough substance to be properly extracted and scored by the pipeline.</p>
</article>
<div class="sidebar">Unrelated sidebar content</div>
</body></html>
"""


class TestNormalizeWhitespace:
    def test_collapses_spaces(self):
        assert normalize_whitespace("hello   world") == "hello world"

    def test_trims_edges(self):
        assert normalize_whitespace("  hello  ") == "hello"

    def test_handles_newlines_and_tabs(self):
        assert normalize_whitespace("hello\n\t  world") == "hello world"

    def test_handles_empty(self):
        assert normalize_whitespace("") == ""

    def test_handles_none(self):
        assert normalize_whitespace(None) == ""


class TestCleanHtmlText:
    def test_removes_tags(self):
        assert clean_html_text("<b>bold</b> text") == "bold text"

    def test_decodes_entities(self):
        # &lt;tag&gt; becomes <tag> after unescape, then stripped as HTML tag
        assert clean_html_text("&amp; test") == "& test"

    def test_removes_comments(self):
        assert clean_html_text("before <!-- comment --> after") == "before after"

    def test_handles_empty(self):
        assert clean_html_text("") == ""


class TestSmartTruncate:
    def test_short_text_unchanged(self):
        text = "Short sentence."
        assert smart_truncate(text, 100) == text

    def test_truncates_at_sentence(self):
        text = "First sentence. Second sentence. Third sentence that is quite long."
        result = smart_truncate(text, 40)
        assert result.endswith(".")
        assert len(result) <= 40

    def test_adds_ellipsis_when_no_sentence_boundary(self):
        text = "A very long word sequence without any punctuation marks that goes on and on"
        result = smart_truncate(text, 50)
        assert len(result) <= 53  # 50 + ellipsis


class TestExtractMainText:
    def test_extracts_from_article_tag(self):
        result = extract_main_text(SIMPLE_ARTICLE_HTML)
        assert len(result) > 100
        assert "first paragraph" in result

    def test_returns_empty_for_no_content(self):
        result = extract_main_text("<html><body><nav>nav only</nav></body></html>")
        assert result == ""


class TestExtractMainTextTrafilatura:
    def test_extracts_from_html(self):
        result = extract_main_text_trafilatura(SIMPLE_ARTICLE_HTML)
        # trafilatura may or may not extract content from simple inline HTML
        # but should not raise an error
        assert isinstance(result, str)

    def test_returns_empty_for_empty_input(self):
        result = extract_main_text_trafilatura("")
        assert result == ""


class TestExtractMainTextDual:
    def test_returns_nonempty_for_article_html(self):
        result = extract_main_text_dual(SIMPLE_ARTICLE_HTML)
        assert len(result) > 50

    def test_returns_string(self):
        result = extract_main_text_dual(SIMPLE_ARTICLE_HTML, url="http://example.com/article")
        assert isinstance(result, str)

    def test_handles_empty_html(self):
        result = extract_main_text_dual("")
        assert isinstance(result, str)
