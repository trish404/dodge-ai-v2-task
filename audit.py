import os
import json
from glob import glob
from collections import defaultdict, Counter

BASE_PATH = "/Users/triahavijayekkumaran/Downloads/dodge/sap-o2c-data"

MAX_SAMPLE_VALUES_PER_COLUMN = 5
MAX_ROWS_PER_FILE_FOR_ANALYSIS = 200


def safe_str(x):
    if x is None:
        return "None"
    if isinstance(x, (dict, list)):
        s = json.dumps(x, ensure_ascii=False)
    else:
        s = str(x)
    return s[:120]


def infer_type(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if isinstance(value, dict):
        return "dict"
    if isinstance(value, list):
        return "list"
    return "str"


def analyze_folder(folder_path):
    jsonl_files = sorted(glob(os.path.join(folder_path, "*.jsonl")))
    folder_name = os.path.basename(folder_path)

    col_info = defaultdict(lambda: {
        "count": 0,
        "types": Counter(),
        "samples": [],
        "non_empty_samples": set()
    })

    total_rows = 0
    file_count = len(jsonl_files)

    for file in jsonl_files:
        rows_read = 0
        with open(file, "r", encoding="utf-8") as f:
            for line in f:
                if rows_read >= MAX_ROWS_PER_FILE_FOR_ANALYSIS:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except Exception:
                    continue

                if not isinstance(row, dict):
                    continue

                total_rows += 1
                rows_read += 1

                for col, val in row.items():
                    col_info[col]["count"] += 1
                    col_info[col]["types"][infer_type(val)] += 1

                    sval = safe_str(val)
                    if sval not in col_info[col]["non_empty_samples"] and len(col_info[col]["samples"]) < MAX_SAMPLE_VALUES_PER_COLUMN:
                        col_info[col]["samples"].append(sval)
                        col_info[col]["non_empty_samples"].add(sval)

    return {
        "folder": folder_name,
        "file_count": file_count,
        "rows_scanned": total_rows,
        "columns": col_info
    }


def main():
    folders = sorted(
        [
            os.path.join(BASE_PATH, x)
            for x in os.listdir(BASE_PATH)
            if os.path.isdir(os.path.join(BASE_PATH, x))
        ]
    )

    all_folder_columns = {}

    print("=" * 100)
    print("FULL JSONL DATASET SCHEMA AUDIT")
    print("=" * 100)

    for folder_path in folders:
        result = analyze_folder(folder_path)
        folder = result["folder"]
        all_folder_columns[folder] = set(result["columns"].keys())

        print(f"\n\n### FOLDER: {folder}")
        print(f"Files: {result['file_count']}")
        print(f"Rows scanned: {result['rows_scanned']}")
        print("-" * 100)

        if not result["columns"]:
            print("No columns found.")
            continue

        for col in sorted(result["columns"].keys()):
            info = result["columns"][col]
            types_str = ", ".join(f"{k}:{v}" for k, v in info["types"].most_common())
            samples_str = " | ".join(info["samples"])
            print(f"{col}")
            print(f"  present_in_rows: {info['count']}")
            print(f"  types: {types_str}")
            print(f"  samples: {samples_str}")

    print("\n\n" + "=" * 100)
    print("POTENTIAL OVERLAPPING COLUMNS ACROSS FOLDERS")
    print("=" * 100)

    column_to_folders = defaultdict(list)
    for folder, cols in all_folder_columns.items():
        for col in cols:
            column_to_folders[col].append(folder)

    for col in sorted(column_to_folders.keys()):
        if len(column_to_folders[col]) > 1:
            print(f"\n{col}")
            for folder in sorted(column_to_folders[col]):
                print(f"  - {folder}")


if __name__ == "__main__":
    main()