document.addEventListener('DOMContentLoaded', function() {  
    setTimeout(() => {  
        const loader = document.getElementById('page-loader');  
        if (loader) {  
            loader.style.opacity = '0';  
            setTimeout(() => {  
                loader.style.display = 'none';  
            }, 300);  
        }  
    }, 300);
    
    const sideNav = document.getElementById('side-nav');
    const sideNavToggle = document.getElementById('side-nav-toggle');
    const contentWrapper = document.getElementById('content-wrapper');
    
    sideNavToggle.addEventListener('click', function() {
        sideNav.classList.toggle('active');
        contentWrapper.classList.toggle('nav-active');
        
        const icon = this.querySelector('.material-icons');
        if (sideNav.classList.contains('active')) {
            icon.textContent = 'close';
        } else {
            icon.textContent = 'menu';
        }
    });
    
    document.addEventListener('click', function(event) {
        if (!sideNav.contains(event.target) && 
            !sideNavToggle.contains(event.target) &&
            sideNav.classList.contains('active')) {
                
            sideNav.classList.remove('active');
            contentWrapper.classList.remove('nav-active');
            sideNavToggle.querySelector('.material-icons').textContent = 'menu';
        }
    });
    
    const sideNavLinks = document.querySelectorAll('.side-nav-link');
    
    sideNavLinks.forEach(link => {
        link.addEventListener('click', function() {
            sideNavLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            
            if (window.innerWidth < 768) {
                sideNav.classList.remove('active');
                contentWrapper.classList.remove('nav-active');
                sideNavToggle.querySelector('.material-icons').textContent = 'menu';
            }
        });
    });
      
    const modal = document.getElementById('api-modal');  
    const modalContent = modal.querySelector('.tkm-modal-content');
});
