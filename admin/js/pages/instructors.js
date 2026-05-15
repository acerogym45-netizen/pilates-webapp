/** 강사 관리 */
const instructors = {
    data: [],
    async render() {
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-user-tie"></i> 강사 관리</h2>
                <button class="btn-primary btn-sm" onclick="instructors.showForm()">
                    <i class="fas fa-plus"></i> 강사 추가
                </button>
            </div>
            <div id="instructorList" class="data-list"><div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div></div>`;
        await this.load();
    },
    async load() {
        try {
            const res = await API.instructors.list({ complexId: getEffectiveComplexId() });
            this.data = res.data || [];
            this.renderList();
        } catch(e) { document.getElementById('instructorList').innerHTML = `<p class="error-hint">${e.message}</p>`; }
    },
    renderList() {
        const c = document.getElementById('instructorList');
        if (!this.data.length) { c.innerHTML = '<p class="empty-hint">등록된 강사가 없습니다</p>'; return; }
        c.innerHTML = this.data.map(i => {
            const rates = i.hourly_rates || {};
            const rateStr = [
                rates.group   ? `그룹 ${Number(rates.group).toLocaleString('ko-KR')}원`   : '',
                rates.private ? `개인 ${Number(rates.private).toLocaleString('ko-KR')}원` : '',
                rates.duet    ? `듀엣 ${Number(rates.duet).toLocaleString('ko-KR')}원`    : '',
            ].filter(Boolean).join(' · ') || '-';
            const progs = Array.isArray(i.assigned_programs) && i.assigned_programs.length
                ? i.assigned_programs.map(p => `<span style="background:#e8f8f0;color:#27ae60;font-size:.72rem;padding:2px 7px;border-radius:10px;margin-right:3px">${escHtml(p)}</span>`).join('')
                : '<span style="color:#bbb;font-size:.78rem">담당 미지정</span>';
            return `
            <div class="list-item" style="flex-wrap:wrap;gap:4px">
                ${i.photo_url ? `<img src="${i.photo_url}" class="item-thumb" alt="${i.name}">` : '<div class="item-thumb-placeholder"><i class="fas fa-user"></i></div>'}
                <div class="item-main" style="flex:1;min-width:0">
                    <strong>${i.name}</strong>
                    <p style="margin:2px 0">${i.title || '-'}</p>
                    <p style="margin:2px 0;font-size:.78rem;color:#e67e22">
                        <i class="fas fa-won-sign" style="font-size:.7rem"></i> ${rateStr}
                    </p>
                    <div style="margin-top:4px">${progs}</div>
                </div>
                <div class="item-actions">
                    <button class="btn-ghost dark btn-sm" onclick="instructors.showForm('${i.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-ghost dark btn-sm" onclick="instructors.deleteItem('${i.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
        }).join('');
    },
    async showForm(id) {
        const i = id ? this.data.find(x => x.id === id) : null;

        // 담당 프로그램 목록 로드 (프로그램 API)
        let progOptions = '';
        try {
            const cid = getEffectiveComplexId() || (i?.complex_id);
            const url = cid ? `/api/programs?complexId=${cid}` : '/api/programs';
            const res = await fetch(url);
            const json = await res.json();
            const progs = (json.data || []).filter(p => p.name);
            const assigned = (i?.assigned_programs) || [];
            progOptions = progs.map(p => {
                const checked = assigned.includes(p.name) ? 'checked' : '';
                return `<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;cursor:pointer;font-size:.88rem">
                    <input type="checkbox" name="iProgram" value="${escHtml(p.name)}" ${checked}
                        style="width:15px;height:15px;cursor:pointer">
                    <span>${escHtml(p.name)}</span>
                </label>`;
            }).join('');
        } catch(e) {
            progOptions = `<p style="color:#aaa;font-size:.82rem">프로그램 목록 로드 실패</p>`;
        }

        // 타임당 단가 (hourly_rates)
        const rates = i?.hourly_rates || {};
        const rateGroup   = rates.group   || 0;
        const ratePrivate = rates.private  || 0;
        const rateDuet    = rates.duet     || 0;

        const body = `
            <div class="form-group"><label>이름 *</label><input type="text" id="iName" value="${i ? escHtml(i.name) : ''}"></div>
            <div class="form-group"><label>직함</label><input type="text" id="iTitle" value="${i ? escHtml(i.title||'') : ''}" placeholder="예: 필라테스 전문 강사"></div>
            <div class="form-group"><label>소개</label><textarea id="iBio" rows="3">${i ? escHtml(i.bio||'') : ''}</textarea></div>
            <div class="form-group">
                <label>사진 URL</label>
                <input type="text" id="iPhoto" value="${i ? escHtml(i.photo_url||'') : ''}" placeholder="https://... 또는 /uploads/파일명">
                <small style="color:#999">또는 파일 직접 업로드:</small>
                <input type="file" id="iPhotoFile" accept="image/*" onchange="instructors.previewPhoto(this)">
                <div id="iPhotoPreview" style="margin-top:8px">
                    ${i?.photo_url ? `<img src="${i.photo_url}" style="width:80px;height:80px;object-fit:cover;border-radius:8px">` : ''}
                </div>
            </div>
            <div class="form-group"><label>표시 순서</label><input type="number" id="iOrder" value="${i?.display_order||0}"></div>

            <!-- ── 타임당 단가 ── -->
            <div class="form-group" style="background:#f8f9fa;border:1.5px solid #e0e0e0;border-radius:8px;padding:14px 16px;margin-top:4px">
                <label style="font-weight:700;color:#333;margin-bottom:10px;display:block">
                    <i class="fas fa-won-sign" style="color:#e67e22;margin-right:4px"></i>타임당 단가 (원)
                </label>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
                    <div>
                        <label style="font-size:.78rem;color:#666;font-weight:600;margin-bottom:4px;display:block">그룹 수업</label>
                        <input type="number" id="iRateGroup" value="${rateGroup}" min="0" step="1000"
                            placeholder="0"
                            style="width:100%;padding:7px 10px;border:1.5px solid #ddd;border-radius:6px;font-size:.9rem;font-weight:700;text-align:right">
                    </div>
                    <div>
                        <label style="font-size:.78rem;color:#666;font-weight:600;margin-bottom:4px;display:block">개인 레슨</label>
                        <input type="number" id="iRatePrivate" value="${ratePrivate}" min="0" step="1000"
                            placeholder="0"
                            style="width:100%;padding:7px 10px;border:1.5px solid #ddd;border-radius:6px;font-size:.9rem;font-weight:700;text-align:right">
                    </div>
                    <div>
                        <label style="font-size:.78rem;color:#666;font-weight:600;margin-bottom:4px;display:block">듀엣 레슨</label>
                        <input type="number" id="iRateDuet" value="${rateDuet}" min="0" step="1000"
                            placeholder="0"
                            style="width:100%;padding:7px 10px;border:1.5px solid #ddd;border-radius:6px;font-size:.9rem;font-weight:700;text-align:right">
                    </div>
                </div>
            </div>

            <!-- ── 담당 프로그램 ── -->
            <div class="form-group" style="background:#f0fff4;border:1.5px solid #a9dfbf;border-radius:8px;padding:14px 16px;margin-top:4px">
                <label style="font-weight:700;color:#333;margin-bottom:10px;display:block">
                    <i class="fas fa-dumbbell" style="color:#27ae60;margin-right:4px"></i>담당 프로그램
                </label>
                <div id="iPrograms" style="max-height:180px;overflow-y:auto;padding-right:4px">
                    ${progOptions || '<p style="color:#aaa;font-size:.82rem">프로그램 없음</p>'}
                </div>
            </div>`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="instructors.save('${id||''}')"><i class="fas fa-save"></i> 저장</button>`;
        openGlobalModal(i ? '강사 수정' : '강사 추가', body, footer);
    },
    previewPhoto(input) {
        if (!input.files[0]) return;
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = e => {
            const preview = document.getElementById('iPhotoPreview');
            if (preview) {
                preview.innerHTML = `
                    <img src="${e.target.result}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:2px solid #27ae60">
                    <div style="font-size:.75rem;color:#27ae60;margin-top:4px"><i class="fas fa-check-circle"></i> 파일 선택됨: ${escHtml(file.name)}</div>`;
            }
            // iPhoto URL 필드는 비워두기 (파일 우선 사용 명확히 표시)
            const iPhoto = document.getElementById('iPhoto');
            if (iPhoto) iPhoto.placeholder = '파일 업로드 선택됨 (저장 시 자동 처리)';
        };
        reader.readAsDataURL(file);
    },
    // 이미지를 Canvas로 리사이즈 후 Blob 반환 (최대 800px, JPEG 0.85)
    _resizeImage(file, maxPx = 800) {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                let w = img.width, h = img.height;
                if (w > maxPx || h > maxPx) {
                    if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
                    else        { w = Math.round(w * maxPx / h); h = maxPx; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
            img.src = url;
        });
    },
    async save(id) {
        const name = document.getElementById('iName').value.trim();
        if (!name) { showToast('이름을 입력하세요', 'error'); return; }

        // 저장 버튼 로딩 표시
        const saveBtn = document.querySelector('#globalModal .btn-primary');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }

        let photoUrl = document.getElementById('iPhoto').value.trim();
        const fileInput = document.getElementById('iPhotoFile');

        // 파일 업로드 처리 (Canvas 리사이즈 → JPEG → FormData)
        if (fileInput && fileInput.files && fileInput.files[0]) {
            try {
                const origFile = fileInput.files[0];
                // Canvas로 리사이즈 (최대 800px, JPEG 변환) → multipart 오류 방지
                const blob = await this._resizeImage(origFile);
                const uploadFile = blob
                    ? new File([blob], 'photo.jpg', { type: 'image/jpeg' })
                    : origFile;

                const formData = new FormData();
                formData.append('image', uploadFile);
                const uploadUrl = window.location.origin + '/api/upload/image';
                const res = await fetch(uploadUrl, { method: 'POST', body: formData });
                // 에러 응답 body도 읽어서 정확한 메시지 표시
                const result = await res.json().catch(() => ({ success: false, error: 'HTTP ' + res.status }));
                if (res.ok && result.success && result.url) {
                    photoUrl = result.url;
                    console.log('[instructor] 이미지 업로드 성공:', photoUrl);
                } else {
                    throw new Error(result.error || 'HTTP ' + res.status);
                }
            } catch(e) {
                console.error('[instructor] 이미지 업로드 실패:', e);
                if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
                showToast('이미지 업로드 실패: ' + e.message, 'error');
                return;
            }
        }

        try {
            // 담당 프로그램 체크박스 수집
            const assignedPrograms = Array.from(
                document.querySelectorAll('input[name="iProgram"]:checked')
            ).map(cb => cb.value);

            // 타임당 단가 수집
            const hourlyRates = {
                group:   parseInt(document.getElementById('iRateGroup')?.value)   || 0,
                private: parseInt(document.getElementById('iRatePrivate')?.value) || 0,
                duet:    parseInt(document.getElementById('iRateDuet')?.value)    || 0,
            };

            const data = {
                name, title: document.getElementById('iTitle').value,
                bio: document.getElementById('iBio').value,
                photo_url: photoUrl,
                display_order: parseInt(document.getElementById('iOrder').value)||0,
                hourly_rates: hourlyRates,
                assigned_programs: assignedPrograms,
            };
            if (id) {
                await API.instructors.update(id, data);
                closeGlobalModal();
                showToast('저장되었습니다');
                await this.load();
            } else {
                const complexId = getEffectiveComplexId();
                if (!complexId) {
                    pickComplexForCreate(async (cxId) => {
                        data.complex_id = cxId;
                        try {
                            await API.instructors.create(data);
                            closeGlobalModal();
                            showToast('저장되었습니다');
                            await instructors.load();
                        }
                        catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
                    });
                    return;
                }
                data.complex_id = complexId;
                await API.instructors.create(data);
                closeGlobalModal();
                showToast('저장되었습니다');
                await this.load();
            }
        } catch(e) {
            console.error('[instructor] save 오류:', e);
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
            showToast('저장 실패: ' + e.message, 'error');
        }
    },
    deleteItem(id) {
        showConfirm('삭제 확인', '강사를 삭제하시겠습니까?', async () => {
            try { await API.instructors.delete(id); showToast('삭제되었습니다'); await this.load(); }
            catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
        });
    }
};

/** 커리큘럼 관리 */
const curricula = {
    data: [],
    async render() {
        const now = new Date();
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-calendar-alt"></i> 커리큘럼 관리</h2>
                <button class="btn-primary btn-sm" onclick="curricula.showForm()">
                    <i class="fas fa-plus"></i> 커리큘럼 등록
                </button>
            </div>
            <div id="curricList" class="data-list"><div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div></div>`;
        await this.load();
    },
    async load() {
        try {
            const res = await API.curricula.list({ complexId: getEffectiveComplexId() });
            this.data = res.data || [];
            this.renderList();
        } catch(e) { document.getElementById('curricList').innerHTML = `<p class="error-hint">${e.message}</p>`; }
    },
    renderList() {
        const c = document.getElementById('curricList');
        if (!this.data.length) { c.innerHTML = '<p class="empty-hint">등록된 커리큘럼이 없습니다</p>'; return; }
        c.innerHTML = this.data.map(cu => `
            <div class="list-item">
                ${cu.image_url ? `<img src="${cu.image_url}" class="item-thumb" alt="${cu.year}년 ${cu.month}월">` : ''}
                <div class="item-main">
                    <strong>${cu.year}년 ${cu.month}월 커리큘럼</strong>
                    <p>${cu.title || ''}</p>
                </div>
                <div class="item-actions">
                    <button class="btn-ghost dark btn-sm" onclick="curricula.showForm('${cu.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-ghost dark btn-sm" onclick="curricula.deleteItem('${cu.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>`).join('');
    },
    showForm(id) {
        const cu = id ? this.data.find(x => x.id === id) : null;
        const now = new Date();
        const body = `
            <div class="form-row">
                <div class="form-group"><label>년도</label><input type="number" id="cuYear" value="${cu?.year||now.getFullYear()}"></div>
                <div class="form-group"><label>월</label><input type="number" id="cuMonth" min="1" max="12" value="${cu?.month||(now.getMonth()+1)}"></div>
            </div>
            <div class="form-group"><label>제목</label><input type="text" id="cuTitle" value="${cu ? escHtml(cu.title||'') : ''}"></div>
            <div class="form-group"><label>내용</label><textarea id="cuContent" rows="5">${cu ? escHtml(cu.content||'') : ''}</textarea></div>
            <div class="form-group">
                <label>이미지 URL</label>
                <input type="text" id="cuImage" value="${cu ? escHtml(cu.image_url||'') : ''}" placeholder="https://...">
                <small>또는 파일 업로드:</small>
                <input type="file" id="cuImageFile" accept="image/*">
            </div>`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="curricula.save('${id||''}')"><i class="fas fa-save"></i> 저장</button>`;
        openGlobalModal(cu ? '커리큘럼 수정' : '커리큘럼 등록', body, footer);
    },
    async save(id) {
        // 저장 버튼 로딩 표시
        const saveBtn = document.querySelector('#globalModal .btn-primary');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }

        let imageUrl = document.getElementById('cuImage').value.trim();
        const fileInput = document.getElementById('cuImageFile');

        // 파일 업로드 처리 (Canvas 리사이즈 → JPEG → FormData)
        if (fileInput && fileInput.files && fileInput.files[0]) {
            try {
                const origFile = fileInput.files[0];
                const blob = await instructors._resizeImage(origFile);
                const uploadFile = blob
                    ? new File([blob], 'image.jpg', { type: 'image/jpeg' })
                    : origFile;
                const formData = new FormData();
                formData.append('image', uploadFile);
                const uploadUrl = window.location.origin + '/api/upload/image';
                const res = await fetch(uploadUrl, { method: 'POST', body: formData });
                const result = await res.json().catch(() => ({ success: false, error: 'HTTP ' + res.status }));
                if (res.ok && result.success && result.url) {
                    imageUrl = result.url;
                } else {
                    throw new Error(result.error || 'HTTP ' + res.status);
                }
            } catch(e) {
                console.error('[curricula] 이미지 업로드 실패:', e);
                if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
                showToast('이미지 업로드 실패: ' + e.message, 'error');
                return;
            }
        }

        try {
            const formData = {
                year: parseInt(document.getElementById('cuYear').value),
                month: parseInt(document.getElementById('cuMonth').value),
                title: document.getElementById('cuTitle').value,
                content: document.getElementById('cuContent').value,
                image_url: imageUrl
            };

            if (id) {
                // 수정: PUT /curricula/:id
                await API.curricula.update(id, formData);
                closeGlobalModal();
                showToast('저장되었습니다');
                await this.load();
            } else {
                // 신규: complex_id 필요
                const complexId = getEffectiveComplexId();
                if (!complexId) {
                    pickComplexForCreate(async (cxId) => {
                        try {
                            await API.curricula.create({ complex_id: cxId, ...formData });
                            closeGlobalModal();
                            showToast('저장되었습니다');
                            await curricula.load();
                        } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
                    });
                    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
                    return;
                }
                await API.curricula.create({ complex_id: complexId, ...formData });
                closeGlobalModal();
                showToast('저장되었습니다');
                await this.load();
            }
        } catch(e) {
            console.error('[curricula] save 오류:', e);
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
            showToast('저장 실패: ' + e.message, 'error');
        }
    },
    deleteItem(id) {
        showConfirm('삭제 확인', '커리큘럼을 삭제하시겠습니까?', async () => {
            try { await API.curricula.delete(id); showToast('삭제되었습니다'); await this.load(); }
            catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
        });
    }
};
