// Complex Context Manager
// URL 파라미터에서 단지 정보를 읽고 전역적으로 관리

class ComplexContext {
    constructor() {
        this.currentComplex = null;
        this.complexSettings = null;
        this.initialized = false;
    }
    
    // URL에서 complex 파라미터 읽기
    getComplexCodeFromURL() {
        const params = new URLSearchParams(window.location.search);
        return params.get('complex') || 'cheongju-sk'; // 기본값: 청주SK뷰자이
    }
    
    // 단지 설정 로드
    async loadComplexSettings() {
        const complexCode = this.getComplexCodeFromURL();
        console.log('🏢 Loading complex:', complexCode);
        
        try {
            const response = await fetch(`tables/complex_settings?limit=100`);
            const result = await response.json();
            
            if (!result.data || result.data.length === 0) {
                throw new Error('No complex settings found');
            }
            
            // complex_code로 찾기
            this.currentComplex = result.data.find(c => c.complex_code === complexCode);
            
            // 못 찾으면 첫 번째 활성화된 단지 사용
            if (!this.currentComplex) {
                console.warn(`⚠️ Complex '${complexCode}' not found, using first active complex`);
                this.currentComplex = result.data.find(c => c.is_active);
            }
            
            // 그래도 없으면 첫 번째 단지
            if (!this.currentComplex) {
                this.currentComplex = result.data[0];
            }
            
            this.complexSettings = this.currentComplex;
            this.initialized = true;
            
            console.log('✅ Complex loaded:', this.currentComplex);
            
            // 브랜딩 적용
            this.applyBranding();
            
            return this.currentComplex;
            
        } catch (error) {
            console.error('❌ Error loading complex settings:', error);
            // 기본 설정 사용
            this.currentComplex = {
                id: 'default',
                complex_name: '필라테스 센터',
                complex_code: 'default',
                is_active: true,
                primary_color: '#667eea'
            };
            this.initialized = true;
            return this.currentComplex;
        }
    }
    
    // 현재 단지 ID 가져오기
    getComplexId() {
        return this.currentComplex ? this.currentComplex.id : null;
    }
    
    // 현재 단지 코드 가져오기 (프로그램 필터링 용)
    getComplexCode() {
        return this.currentComplex ? this.currentComplex.complex_code : null;
    }
    
    // 현재 단지 정보 가져오기
    getComplex() {
        return this.currentComplex;
    }
    
    // 브랜딩 적용 (로고, 색상, 제목)
    applyBranding() {
        if (!this.currentComplex) return;
        
        const { complex_name, primary_color, logo_url } = this.currentComplex;
        
        // 페이지 타이틀 변경
        document.title = `${complex_name} - 필라테스 레슨 신청`;
        
        // 헤더 h1 태그 찾아서 텍스트 변경
        const headerH1 = document.querySelector('.header h1');
        if (headerH1) {
            headerH1.textContent = complex_name;
        }
        
        // 로고 이미지가 있으면 적용
        if (logo_url) {
            const headerH1 = document.querySelector('.header h1');
            if (headerH1) {
                headerH1.innerHTML = `<img src="${logo_url}" alt="${complex_name}" style="max-height: 60px; margin-right: 10px;">`;
            }
        }
        
        // 주요 색상 적용 (CSS 변수 사용)
        if (primary_color) {
            document.documentElement.style.setProperty('--primary-color', primary_color);
        }
        
        console.log('🎨 Branding applied:', complex_name);
    }
    
    // API 호출 시 사용할 필터 파라미터
    getFilterParams() {
        return this.currentComplex ? `&complex_id=${this.currentComplex.id}` : '';
    }
    
    // 데이터 저장 시 포함할 complex_id
    getComplexIdForSave() {
        return this.currentComplex ? this.currentComplex.id : null;
    }
}

// 전역 인스턴스 생성
const complexContext = new ComplexContext();

// 초기화 함수 (페이지 로드 시 호출)
async function initializeComplexContext() {
    await complexContext.loadComplexSettings();
    return complexContext;
}

// Export for use in other scripts
window.complexContext = complexContext;
window.initializeComplexContext = initializeComplexContext;
