"""
IMEI Validation 데이터 추출기
Samsung NASCA DRM 파일을 Python(pandas)으로 읽어 JSON으로 내보냅니다.
JSON 파일은 DRM 암호화 대상이 아니므로 대시보드에서 바로 사용 가능합니다.
"""

import os
import sys
import json
import re
import glob
from pathlib import Path
from datetime import datetime

# Windows 콘솔은 기본적으로 cp949를 쓰기 때문에 ✅ 같은 이모지를 출력하면
# UnicodeEncodeError로 죽는다. UTF-8로 재설정해서 방지한다.
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

try:
    import pandas as pd
except ImportError:
    print("[ERROR] pandas가 설치되어 있지 않습니다.")
    print("  설치: pip install pandas openpyxl")
    input("엔터를 눌러 종료...")
    sys.exit(1)


# ── 설정 ──────────────────────────────────────────────
# 이 스크립트와 같은 폴더(Data 변환)에서 Excel을 읽고 JSON을 저장합니다.
INPUT_DIR  = Path(__file__).parent
OUTPUT_DIR = Path(__file__).parent
# ─────────────────────────────────────────────────────


def find_excel_files():
    files = list(INPUT_DIR.glob("*.xlsx")) + list(INPUT_DIR.glob("*.xls"))
    return files


def detect_header_row(file_path):
    """첫 10행에서 헤더 행 자동 감지"""
    try:
        df_raw = pd.read_excel(file_path, header=None, nrows=10)
        keywords = ['imei', 'grade', 'market', 'model', 'galaxy']
        for idx, row in df_raw.iterrows():
            row_str = ' '.join(str(v).lower() for v in row.dropna())
            if any(k in row_str for k in keywords):
                return idx
    except Exception:
        pass
    return 0


def normalize_imei(val):
    """과학적 표기법(3.5E+14) → 정수 문자열"""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    s = str(val).strip()
    # 과학적 표기법 처리
    try:
        if 'e' in s.lower():
            return str(int(float(s)))
    except Exception:
        pass
    return s


def read_excel_safe(file_path):
    """Excel 파일 읽기 (헤더 자동 감지 포함)"""
    header_row = detect_header_row(file_path)
    print(f"  헤더 행: {header_row + 1}행")
    df = pd.read_excel(file_path, header=header_row, dtype=str)
    df = df.dropna(how='all')
    return df


def detect_columns(df):
    """컬럼 역할 자동 감지 (이름 + 값 기반)"""
    cols = df.columns.tolist()
    result = {}

    name_map = {
        'imei':        ['imei', '제품번호', 'imei번호'],
        'marketName':  ['market name', 'market', 'product name', '제품명', '상품명', 'marketname'],
        'model':       ['model', 'model code', '모델', 'model name'],
        'grade':       ['grade', '등급'],
        'b2bApp':      ['b2b app. y/n', 'b2b app', 'b2b여부', 'b2b'],
        'color':       ['color', 'colour', '색상', '컬러'],
        'storage':     ['storage', '용량', '저장용량'],
        'batteryHealth': ['battery health', '배터리', 'battery'],
    }

    # 컬럼명 기반 감지
    for key, names in name_map.items():
        for col in cols:
            if col.strip().lower() in names:
                result[key] = col
                break

    # 값 기반 보완
    sample = df.head(30)
    if 'imei' not in result:
        for col in cols:
            for val in sample[col].dropna():
                s = normalize_imei(val)
                if re.match(r'^35\d{12,14}$', s):
                    result['imei'] = col
                    break
            if 'imei' in result:
                break

    if 'marketName' not in result:
        for col in cols:
            for val in sample[col].dropna():
                if re.search(r'galaxy|note|watch', str(val), re.I):
                    result['marketName'] = col
                    break
            if 'marketName' in result:
                break

    if 'grade' not in result:
        for col in cols:
            cnt = sum(1 for v in sample[col].dropna()
                      if re.match(r'^[A-Ea-e][+\-]?$', str(v).strip()))
            if cnt >= 3:
                result['grade'] = col
                break

    if 'b2bApp' not in result:
        for col in cols:
            cnt = sum(1 for v in sample[col].dropna()
                      if str(v).strip().upper() in ('Y', 'N'))
            if cnt >= 3:
                result['b2bApp'] = col
                break

    return result


def export_json(file_path):
    print(f"\n처리 중: {file_path.name}")

    df = read_excel_safe(file_path)
    print(f"  로드: {len(df)}행 x {len(df.columns)}컬럼")

    col_map = detect_columns(df)
    print(f"  컬럼 감지(참고용, 필드 필터링에는 사용 안 함): {col_map}")

    imei_col = col_map.get('imei')

    # 원본 엑셀의 모든 컬럼을 그대로 보존한다 (일부 필드만 추출하지 않음).
    # 대시보드의 detectColumns()가 원본 컬럼명(예: 'IMEI', 'Market Name')을
    # 그대로 인식하므로, 여기서 imei/marketName 같은 별도 키로 축약할 필요가 없다.
    records = []
    for _, row in df.iterrows():
        rec = {}
        for col in df.columns:
            val = row.get(col, '')
            rec[str(col)] = '' if pd.isna(val) else str(val).strip()
        # IMEI 컬럼만 과학적 표기법 방어적으로 정규화 (원본 컬럼명 그대로 덮어씀)
        if imei_col and imei_col in rec:
            rec[imei_col] = normalize_imei(rec[imei_col])
        records.append(rec)

    # 메타 정보 포함
    output = {
        'exportedAt':  datetime.now().isoformat(),
        'sourceFile':  file_path.name,
        'totalRows':   len(records),
        'totalColumns': len(df.columns),
        'columnMap':   col_map,
        'records':     records,
    }

    out_name = f"data_{file_path.stem}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    out_path = OUTPUT_DIR / out_name

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"  ✅ JSON 저장: {out_path}")
    print(f"  총 {len(records)}건 내보내기 완료")
    return out_path


if __name__ == '__main__':
    print("=" * 60)
    print("IMEI Validation 데이터 추출기 (DRM 우회)")
    print("=" * 60)

    files = find_excel_files()
    if not files:
        print(f"\n[ERROR] {INPUT_DIR} 에 Excel 파일이 없습니다.")
        input("엔터를 눌러 종료...")
        sys.exit(1)

    for f in files:
        try:
            out = export_json(f)
        except Exception as e:
            print(f"  [ERROR] {f.name}: {e}")

    print("\n" + "=" * 60)
    print(f"완료! JSON 파일을 대시보드에 업로드하세요.")
    print(f"저장 위치: {OUTPUT_DIR}")
    print("=" * 60)
    input("\n엔터를 눌러 종료...")
