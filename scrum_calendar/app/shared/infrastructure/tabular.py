import csv
import io

import openpyxl
from fastapi import HTTPException

from app.shared.domain.text import normalize_text


def coerce_cell(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def unique_headers(headers: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    unique: list[str] = []
    for header in headers:
        cleaned = header.strip()
        if not cleaned:
            unique.append(cleaned)
            continue
        count = seen.get(cleaned, 0) + 1
        seen[cleaned] = count
        if count > 1:
            cleaned = f"{cleaned}__{count}"
        unique.append(cleaned)
    return unique


def header_base(value: str) -> str:
    import re

    cleaned = normalize_text(value or "")
    return re.sub(r"__\d+$", "", cleaned)


def parse_xlsx(content: bytes) -> tuple[list[str], list[dict]]:
    workbook = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    header_row = None
    header_index = 0
    for idx, row in enumerate(rows):
        if row and any(cell is not None and str(cell).strip() for cell in row):
            header_row = row
            header_index = idx
            break
    if not header_row:
        return [], []
    headers = unique_headers([coerce_cell(cell) for cell in header_row])
    data_rows = []
    for row in rows[header_index + 1 :]:
        if not row or not any(cell is not None and str(cell).strip() for cell in row):
            continue
        row_dict = {}
        for idx, header in enumerate(headers):
            if not header:
                continue
            value = row[idx] if idx < len(row) else ""
            row_dict[header] = coerce_cell(value)
        data_rows.append(row_dict)
    return headers, data_rows


def decode_csv(content: bytes) -> str:
    encodings = ["utf-8-sig"]
    if b"\x00" in content[:1000]:
        encodings = ["utf-16", "utf-16-le", "utf-16-be"] + encodings
    encodings += ["cp1252", "latin-1"]
    for encoding in encodings:
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("latin-1", errors="replace")


def parse_csv_text(text: str) -> tuple[list[str], list[dict]]:
    sample = text[:4096]
    delimiter = ","
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=[",", ";", "\t", "|"])
        delimiter = dialect.delimiter
    except csv.Error:
        if sample.count(";") > sample.count(","):
            delimiter = ";"
        elif "\t" in sample:
            delimiter = "\t"
        elif "|" in sample:
            delimiter = "|"
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = []
    for row in reader:
        if not row or not any(str(cell).strip() for cell in row):
            continue
        rows.append(row)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV sin encabezados")
    headers = unique_headers([coerce_cell(cell) for cell in rows[0]])
    data_rows = []
    for row in rows[1:]:
        row_dict = {}
        for idx, header in enumerate(headers):
            if not header:
                continue
            value = row[idx] if idx < len(row) else ""
            row_dict[header] = coerce_cell(value)
        data_rows.append(row_dict)
    return headers, data_rows
