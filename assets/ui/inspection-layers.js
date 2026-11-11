// 이미지 경로는 이 파일이 아니라 chessworld_test/index.html을 기준으로 작성합니다.
// 예: background: './assets/ui/inspection-background.png'
// null이면 현재 임시 그림을 사용하고 오류로 표시하지 않습니다.
export const inspectionLayers = {
  background: null, // 검문소 배경: 1920 × 1080 권장
  window: null,     // 창구·유리: 1920 × 1080 투명 PNG 권장
  counter: null,    // 앞쪽 카운터: 1920 × 1080 투명 PNG 권장
  terminal: './assets/ui/terminal-sample.svg', // 샘플. 직접 만든 이미지 경로로 교체하거나 null로 비울 수 있습니다.
};
