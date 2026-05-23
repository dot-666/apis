
        // Add tkm-like functionality and animations  
        document.addEventListener('DOMContentLoaded', function() {  
            // Hide loader after page loads  
            setTimeout(() => {  
                const loader = document.getElementById('page-loader');  
                if (loader) {  
                    loader.style.opacity = '0';  
                    setTimeout(() => {  
                        loader.style.display = 'none';  
                    }, 300);  
                }  
            }, 300);
            
            // Side navigation functionality
            const sideNav = document.getElementById('side-nav');
            const sideNavToggle = document.getElementById('side-nav-toggle');
            const contentWrapper = document.getElementById('content-wrapper');
            
            sideNavToggle.addEventListener('click', function() {
                sideNav.classList.toggle('active');
                contentWrapper.classList.toggle('nav-active');
                
                // Change icon based on state
                const icon = this.querySelector('.material-icons');
                if (sideNav.classList.contains('active')) {
                    icon.textContent = 'close';
                } else {
                    icon.textContent = 'menu';
                }
            });
            
            // Close side nav when clicking outside
            document.addEventListener('click', function(event) {
                if (!sideNav.contains(event.target) && 
                    !sideNavToggle.contains(event.target) && 
                    sideNav.classList.contains('active')) {
                    sideNav.classList.remove('active');
                    contentWrapper.classList.remove('nav-active');
                    sideNavToggle.querySelector('.material-icons').textContent = 'menu';
                }
            });
            
            // Side navigation links active state
            const sideNavLinks = document.querySelectorAll('.side-nav-link');
            sideNavLinks.forEach(link => {
                link.addEventListener('click', function() {
                    sideNavLinks.forEach(l => l.classList.remove('active'));
                    this.classList.add('active');
                    
                    // For mobile: close nav after clicking
                    if (window.innerWidth < 768) {
                        sideNav.classList.remove('active');
                        contentWrapper.classList.remove('nav-active');
                        sideNavToggle.querySelector('.material-icons').textContent = 'menu';
                    }
                });
            });
              
            // Modal animation enhancement  
            const modal = document.getElementById('api-modal');  
            const modalContent = modal.querySelector('.tkm-modal-content');  
            const overlay = modal.querySelector('.tkm-modal');  
              
            // To be called from your script.js when opening modal  
            window.openModal = function() {  
                modal.classList.remove('hidden');  
                setTimeout(() => {  
                    modal.classList.add('opacity-100');  
                    overlay.classList.add('opacity-100');  
                    modalContent.classList.remove('scale-95', 'opacity-0');  
                    modalContent.classList.add('scale-100', 'opacity-100');  
                }, 10);  
            };  
              
            // To be called from your script.js when closing modal  
            window.closeModal = function() {  
                modal.classList.remove('opacity-100');  
                overlay.classList.remove('opacity-100');  
                modalContent.classList.remove('scale-100', 'opacity-100');  
                modalContent.classList.add('scale-95', 'opacity-0');  
                  
                setTimeout(() => {  
                    modal.classList.add('hidden');  
                }, 200);  
            };  
              
            // Enhanced API card rendering with tkm-like styling  
            window.renderApiCard = function(api) {  
                const methodClass = {  
                    'GET': 'method-get',  
                    'POST': 'method-post',  
                    'PUT': 'method-put',  
                    'DELETE': 'method-delete'  
                }[api.method] || 'method-get';  
                  
                return `  
                <div class="tkm-card mb-4 cursor-pointer" data-api="${api.id}">  
                    <div class="tkm-list-item flex justify-between items-center">  
                        <div class="flex-1">  
                            <div class="flex items-center mb-2">  
                                <span class="method-badge ${methodClass} mr-2">${api.method}</span>  
                                <h3 class="text-base font-medium text-gray-800">${api.name}</h3>  
                            </div>  
                            <p class="text-sm text-gray-500 mb-2">${api.description}</p>  
                            <div class="flex items-center text-xs text-gray-400">  
                                <code class="font-mono">${api.endpoint}</code>  
                            </div>  
                        </div>  
                        <span class="material-icons text-gray-300 ml-2">chevron_right</span>  
                    </div>  
                </div>`;  
            };  
              
            // Override param input rendering for tkm styling  
            window.renderParamInput = function(param) {  
                const inputId = `param-${param.name}`;  
                  
                return `  
                <div class="param-group">  
                    <label for="${inputId}" class="block text-sm font-medium text-gray-700 mb-1">${param.name}</label>  
                    <input type="text" id="${inputId}" value="${param.default || ''}"   
                        class="tkm-input w-full"   
                        placeholder="${param.placeholder || ''}">  
                    <p class="text-xs text-gray-500 mt-1">${param.description || ''}</p>  
                </div>`;  
            };  
        });  