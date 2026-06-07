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
    
    // 단지 설정 로드 — /api/complexes/by-code/:code 사용 (venue_type, theme_name 포함)
    async loadComplexSettings() {
        const complexCode = this.getComplexCodeFromURL();
        console.log('🏢 Loading complex:', complexCode);

        try {
            const response = await fetch(`/api/complexes/by-code/${encodeURIComponent(complexCode)}`);
            const result   = await response.json();

            if (!result.success || !result.data) {
                throw new Error(result.error || 'Complex not found');
            }

            const raw = result.data;
            // complexes 테이블 필드명(code, name)을 레거시 키(complex_code, complex_name)로도 접근 가능하게 정규화
            this.currentComplex = {
                ...raw,
                complex_code: raw.code,
                complex_name: raw.name,
            };

            this.complexSettings = this.currentComplex;
            this.initialized     = true;

            console.log('✅ Complex loaded:', this.currentComplex.name,
                        '| venue_type:', this.currentComplex.venue_type,
                        '| theme_name:', this.currentComplex.theme_name);

            this.applyBranding();
            return this.currentComplex;

        } catch (error) {
            console.error('❌ Error loading complex settings:', error);
            this.currentComplex = {
                id: 'default',
                code: complexCode,
                name: '필라테스 센터',
                complex_code: complexCode,
                complex_name: '필라테스 센터',
                is_active:    true,
                primary_color:'#667eea',
                venue_type:   'apartment',
                theme_name:   'default',
            };
            this.initialized = true;
            return this.currentComplex;
        }
    }
    
    // 현재 단지 ID 가져오기
    getComplexId() {
        return this.currentComplex ? this.currentComplex.id : null;
    }
    
    // 현재 단지 코드 가져오기
    getComplexCode() {
        return this.currentComplex ? (this.currentComplex.code || this.currentComplex.complex_code) : null;
    }
    
    // 현재 단지 정보 가져오기
    getComplex() {
        return this.currentComplex;
    }
    
    // 브랜딩 적용 (로고, 색상, 제목, 테마 클래스)
    applyBranding() {
        if (!this.currentComplex) return;

        // complexes 테이블 필드명(name) 우선, 레거시(complex_name) 폴백
        const displayName   = this.currentComplex.name || this.currentComplex.complex_name || '필라테스 센터';
        const primary_color = this.currentComplex.primary_color;
        const logo_url      = this.currentComplex.logo_url;
        const theme_name    = this.currentComplex.theme_name || 'default';

        // ★ body에 theme-{name} 클래스 적용 — CSS 스코프(body.theme-hotel {...}) 활성화의 핵심
        // 기존 theme-* 클래스를 모두 제거한 뒤 새 테마 적용
        document.body.classList.forEach(cls => {
            if (cls.startsWith('theme-')) document.body.classList.remove(cls);
        });
        if (theme_name && theme_name !== 'default') {
            document.body.classList.add(`theme-${theme_name}`);
            console.log(`🎨 Theme class applied: theme-${theme_name}`);
        }

        document.title = `${displayName} - 필라테스 레슨 신청`;

        const headerH1 = document.querySelector('.header h1');
        if (headerH1) {
            if (logo_url) {
                headerH1.innerHTML = `<img src="${logo_url}" alt="${displayName}" style="max-height:60px;margin-right:10px;">`;
            } else {
                headerH1.textContent = displayName;
            }
        }

        if (primary_color) {
            document.documentElement.style.setProperty('--primary-color', primary_color);
        }

        console.log('🎨 Branding applied:', displayName, '| theme:', theme_name);
    }
    
    // API 호출 시 사용할 필터 파라미터
    getFilterParams() {
        return this.currentComplex ? `&complex_id=${this.currentComplex.id}` : '';
    }
    
    // 데이터 저장 시 포함할 complex_id
    getComplexIdForSave() {
        return this.currentComplex ? this.currentComplex.id : null;
    }

    // venue_type 반환 ('apartment' | 'hotel' | null)
    getVenueType() {
        return this.currentComplex ? (this.currentComplex.venue_type || 'apartment') : null;
    }

    // theme_name 반환 ('default' | 'hotel' | 'modern' | ...)
    getThemeName() {
        return this.currentComplex ? (this.currentComplex.theme_name || 'default') : 'default';
    }

    // 호텔 모드 여부: venue_type='hotel' 이면 true (테마와 독립)
    // 퀵액션 UI 전환, 폼 문구 커스터마이징 등 비즈니스 로직 전반에 사용
    isHotel() {
        if (!this.currentComplex) return false;
        return this.currentComplex.venue_type === 'hotel';
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
