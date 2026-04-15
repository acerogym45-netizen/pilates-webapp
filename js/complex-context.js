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
        return params.get('complex') || 'apt-demo'; // 기본값: apt-demo
    }
    
    // 단지 설정 로드
    async loadComplexSettings() {
        const complexCode = this.getComplexCodeFromURL();
        console.log('🏢 Loading complex:', complexCode);
        
        try {
            // 신규 /api/complexes 엔드포인트 사용
            const response = await fetch(`/api/complexes/by-code/${complexCode}`);
            
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    this.currentComplex = result.data;
                    this.complexSettings = result.data;
                    this.initialized = true;
                    console.log('✅ Complex loaded:', this.currentComplex.name || this.currentComplex.code);
                    this.applyBranding();
                    return this.currentComplex;
                }
            }
            
            // 코드로 못 찾으면 전체 목록에서 첫 번째 사용
            console.warn(`⚠️ Complex '${complexCode}' not found, fetching list...`);
            const listResponse = await fetch('/api/complexes');
            const listResult = await listResponse.json();
            
            if (listResult.success && listResult.data && listResult.data.length > 0) {
                // is_active 기준 필터
                this.currentComplex = listResult.data.find(c => c.is_active) || listResult.data[0];
                this.complexSettings = this.currentComplex;
                this.initialized = true;
                console.log('✅ Using first available complex:', this.currentComplex.name || this.currentComplex.code);
                this.applyBranding();
                return this.currentComplex;
            }
            
            throw new Error('No complexes found');
            
        } catch (error) {
            console.error('❌ Error loading complex settings:', error);
            // 기본 설정 사용
            this.currentComplex = {
                id: 'default',
                name: '필라테스 센터',
                code: complexCode,
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
        return this.currentComplex ? this.currentComplex.code : null;
    }
    
    // 현재 단지 정보 가져오기
    getComplex() {
        return this.currentComplex;
    }
    
    // 브랜딩 적용 (로고, 색상, 제목)
    applyBranding() {
        if (!this.currentComplex) return;
        
        const { name, primary_color, logo_url } = this.currentComplex;
        const displayName = name || this.currentComplex.complex_name || '필라테스 센터';
        
        // 페이지 타이틀 변경
        document.title = `${displayName} - 필라테스 레슨 신청`;
        
        // 헤더 h1 태그 찾아서 텍스트 변경
        const headerH1 = document.querySelector('.header h1');
        if (headerH1) {
            if (logo_url) {
                headerH1.innerHTML = `<img src="${logo_url}" alt="${displayName}" style="max-height: 60px; margin-right: 10px;">`;
            } else {
                headerH1.textContent = displayName;
            }
        }
        
        // 주요 색상 적용 (CSS 변수 사용)
        const color = primary_color || this.currentComplex.primaryColor;
        if (color) {
            document.documentElement.style.setProperty('--primary-color', color);
        }
        
        console.log('🎨 Branding applied:', displayName);
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
