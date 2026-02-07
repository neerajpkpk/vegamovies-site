// Add smooth scrolling and interactive effects
    document.querySelectorAll('.tag').forEach(tag => {
      tag.addEventListener('click', function() {
        this.style.transform = 'scale(0.95)';
        setTimeout(() => {
          this.style.transform = 'scale(1)';
        }, 150);
      });
    });
    
    // Add click tracking for download buttons
    document.querySelectorAll('.download-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        this.style.transform = 'translateY(-4px)';
        setTimeout(() => {
          this.style.transform = 'translateY(-2px)';
        }, 200);
        
        // Track download click
        console.log('Download clicked for:', this.previousElementSibling.textContent);
      });
    });
    
    // Add image loading effects
    document.querySelectorAll('img').forEach(img => {
      img.addEventListener('load', function() {
        this.style.opacity = '1';
      });
    });
    
    // Add poster click effect
    document.querySelector('.movie-poster img').addEventListener('click', function() {
      this.style.transform = 'scale(1.1)';
      setTimeout(() => {
        this.style.transform = 'scale(1)';
      }, 300);
    });