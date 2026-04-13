/**
 * API 클라이언트 모듈
 * 모든 API 호출을 중앙에서 관리 - 오류 추적 및 수정 용이
 */
const API = {
    baseUrl: '/api',

    async request(method, path, body = null) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) opts.body = JSON.stringify(body);
        
        try {
            const res = await fetch(`${this.baseUrl}${path}`, opts);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            return data;
        } catch (e) {
            console.error(`API Error [${method} ${path}]:`, e.message);
            throw e;
        }
    },

    get:    (path)        => API.request('GET', path),
    post:   (path, body)  => API.request('POST', path, body),
    put:    (path, body)  => API.request('PUT', path, body),
    delete: (path, body)  => API.request('DELETE', path, body),

    // 단지
    complexes: {
        getByCode: (code) => API.get(`/complexes/by-code/${code}`),
        verifyPassword: (complexCode, password) => API.post('/complexes/verify-password', { complexCode, password }),
        list: () => API.get('/complexes'),
        create: (data) => API.post('/complexes', data),
        update: (id, data) => API.put(`/complexes/${id}`, data),
        selfUpdate: (id, data) => API.put(`/complexes/${id}/self`, data),
        delete: (id, masterPassword) => API.delete(`/complexes/${id}`, { masterPassword }),
    },

    // 프로그램
    programs: {
        list: (params = {}) => {
            const q = new URLSearchParams(params).toString();
            return API.get(`/programs${q ? '?' + q : ''}`);
        },
        get: (id) => API.get(`/programs/${id}`),
        capacity: (id) => API.get(`/programs/${id}/capacity`),
        create: (data) => API.post('/programs', data),
        update: (id, data) => API.put(`/programs/${id}`, data),
        delete: (id) => API.delete(`/programs/${id}`),
    },

    // 신청
    applications: {
        list: (params = {}) => {
            const q = new URLSearchParams(params).toString();
            return API.get(`/applications${q ? '?' + q : ''}`);
        },
        my: (params) => {
            const q = new URLSearchParams(params).toString();
            return API.get(`/applications/my?${q}`);
        },
        get: (id) => API.get(`/applications/${id}`),
        create: (data) => API.post('/applications', data),
        update: (id, data) => API.put(`/applications/${id}`, data),
        delete: (id) => API.delete(`/applications/${id}`),
        transfer: (id, data) => API.post(`/applications/${id}/transfer`, data),
        feeCalc: (data) => API.post('/applications/fee-calc', data),
    },

    // 공지사항
    notices: {
        list: (params = {}) => {
            const q = new URLSearchParams(params).toString();
            return API.get(`/notices${q ? '?' + q : ''}`);
        },
        create: (data) => API.post('/notices', data),
        update: (id, data) => API.put(`/notices/${id}`, data),
        delete: (id) => API.delete(`/notices/${id}`),
    },

    // 문의
    inquiries: {
        list: (params = {}) => {
            const q = new URLSearchParams(params).toString();
            return API.get(`/inquiries${q ? '?' + q : ''}`);
        },
        create: (data) => API.post('/inquiries', data),
        update: (id, data) => API.put(`/inquiries/${id}`, data),
        delete: (id) => API.delete(`/inquiries/${id}`),
    },

    // 강사
    instructors: {
        list: (params = {}) => {
            const q = new URLSearchParams(params).toString();
            return API.get(`/instructors${q ? '?' + q : ''}`);
        },
        create: (data) => API.post('/instructors', data),
        update: (id, data) => API.put(`/instructors/${id}`, data),
        delete: (id) => API.delete(`/instructors/${id}`),
    },

    // 커리큘럼
    curricula: {
        list: (params = {}) => {
            const q = new URLSearchParams(params).toString();
            return API.get(`/curricula${q ? '?' + q : ''}`);
        },
        create: (data) => API.post('/curricula', data),
        delete: (id) => API.delete(`/curricula/${id}`),
    },

    // 해지
    cancellations: {
        list: (params = {}) => {
            const q = new URLSearchParams(params).toString();
            return API.get(`/cancellations${q ? '?' + q : ''}`);
        },
        create: (data) => API.post('/cancellations', data),
        update: (id, data) => API.put(`/cancellations/${id}`, data),
    },

    // 통계
    stats: {
        dashboard: (params = {}) => {
            const q = new URLSearchParams(params).toString();
            return API.get(`/stats/dashboard${q ? '?' + q : ''}`);
        }
    },

    // CSV 가져오기
    importCsv: {
        applications: (complexId, file, overwrite = false) => {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('complex_id', complexId);
            fd.append('overwrite', String(overwrite));
            return fetch(`${API.baseUrl}/upload/csv/applications`, { method: 'POST', body: fd })
                .then(r => r.json())
                .then(d => { if (!d.success) throw new Error(d.error); return d; });
        },
        inquiries: (complexId, file) => {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('complex_id', complexId);
            return fetch(`${API.baseUrl}/upload/csv/inquiries`, { method: 'POST', body: fd })
                .then(r => r.json())
                .then(d => { if (!d.success) throw new Error(d.error); return d; });
        },
        templateUrl: (type) => `${API.baseUrl}/upload/csv/template/${type}`
    }
};

window.API = API;
