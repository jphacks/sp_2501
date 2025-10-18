import os
import time
import requests # HTTP 통신을 위한 라이브러리
import schedule # 주기적인 작업을 위한 라이브러리 (py -m pip install schedule)

# --- 설정 ---
# app.py와 동일한 로직으로 screenshot 폴더 경로를 찾습니다.
# (backend 폴더의 부모 폴더(프로젝트 루트) + 'screenshot')
REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
SCREENSHOT_DIR = os.path.join(REPO_ROOT, 'screenshot')

# ★★★ 전송할 Vercel API의 URL을 입력하세요. ★★★
request_URL = "" # 예: 'myapp.vercel.app'
VERCEL_API_URL = f'https://{request_URL}/api/upload'

UPLOAD_INTERVAL_SECONDS = 10 # 10초마다 폴더를 확인
BATCH_SIZE = 2              # 2개씩 묶어서 전송

# --- 전송 로직 ---

def send_screenshots(filepaths):
    """
    지정된 파일 경로 리스트를 multipart/form-data로 서버에 POST 전송합니다.
    """
    print(f"전송 시도: {len(filepaths)}개의 파일")
    
    opened_files = [] # 열린 파일 객체를 관리하기 위한 리스트
    try:
        # 'rb' (read binary) 모드로 파일을 열어 리스트에 추가
        files_data = {}
        for i, path in enumerate(filepaths):
            filename = os.path.basename(path)
            file_obj = open(path, 'rb')
            opened_files.append(file_obj)
            # (필드명, (파일이름, 파일객체, 컨텐츠타입))
            files_data[f'screenshot{i+1}'] = (filename, file_obj, 'image/png')

        # 서버로 데이터 전송
        response = requests.post(VERCEL_API_URL, files=files_data)

        if response.status_code == 200:
            print(f"전송 성공: {response.json().get('message')}")
            return True
        else:
            print(f"전송 실패: {response.status_code}, {response.text}")
            return False

    except Exception as e:
        print(f"전송 중 예외 발생: {e}")
        return False
    finally:
        # 전송 성공/실패 여부와 관계없이 모든 파일 객체를 닫습니다.
        for f in opened_files:
            f.close()

# --- 메인 작업 함수 ---

def job():
    """
    폴더를 확인하고, 오래된 파일을 찾아 전송을 시도하는 메인 작업
    """
    print(f"폴더 확인 중: {SCREENSHOT_DIR}")
    
    try:
        # 임시 파일을 제외한 PNG 파일 리스트업
        all_files = [f for f in os.listdir(SCREENSHOT_DIR) 
                     if f.endswith('.png') and not f.startswith('temp_')]
        
        # 파일 경로 리스트 생성
        full_paths = [os.path.join(SCREENSHOT_DIR, f) for f in all_files]
        
        # 생성(수정) 시간이 오래된 순으로 정렬
        full_paths.sort(key=os.path.getmtime)
        
        if len(full_paths) >= BATCH_SIZE:
            # 전송할 파일 배치 선정 (가장 오래된 BATCH_SIZE 개)
            files_to_send = full_paths[:BATCH_SIZE]
            
            print(f"전송 대상 발견: {files_to_send}")
            
            # 전송 시도
            if send_screenshots(files_to_send):
                # 전송 성공 시 로컬 파일 삭제
                for path in files_to_send:
                    os.remove(path)
                    print(f"삭제 완료: {path}")
            else:
                print("전송에 실패하여 파일을 삭제하지 않습니다.")
                
        else:
            print(f"파일이 {BATCH_SIZE}개 미만입니다. (현재: {len(full_paths)}개). 대기합니다.")

    except Exception as e:
        print(f"작업 중 오류 발생: {e}")

# --- 스크립트 실행 ---

if __name__ == "__main__":
    print("--- 스크린샷 업로더 시작 ---")
    print(f"감시 대상 폴더: {SCREENSHOT_DIR}")
    print(f"전송 대상 서버: {VERCEL_API_URL}")
    print(f"{UPLOAD_INTERVAL_SECONDS}초마다 {BATCH_SIZE}개씩 전송을 시도합니다.")
    
    # schedule 라이브러리를 사용해 UPLOAD_INTERVAL_SECONDS 마다 job 함수 실행
    # (py -m pip install schedule 필요)
    try:
        import schedule
    except ImportError:
        print("에러: 'schedule' 라이브러리가 필요합니다. 'py -m pip install schedule'을 실행하세요.")
        exit(1)

    # 폴더가 없으면 생성
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    
    schedule.every(UPLOAD_INTERVAL_SECONDS).seconds.do(job)

    try:
        while True:
            schedule.run_pending()
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n업로더를 종료합니다.")