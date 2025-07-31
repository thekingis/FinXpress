const toastContainer = document.createElement("div");
toastContainer.id = "toastContainer";
toastContainer.classList = "toast-container position-fixed bottom-0 end-0 p-3";
document.body.appendChild(toastContainer);

class Toast {
    constructor(toastText) {
        this.toastText = toastText;
        this.id = crypto.randomUUID();
        const toast = document.createElement("div");
        toast.classList = "toast";
        toast.id = this.id;
        toast.role = "alert";
        toast.setAttribute("aria-live", "assertive");
        toast.setAttribute("aria-atomic", "true");
        toast.setAttribute('style', 'z-index: 9999;');
        toast.innerHTML = `
            <div class="toast-header">
                <img src="/images/icon.png" class="rounded me-2" width="20">
                <strong class="me-auto">FinXpress</strong>
                <small>Just Now</small>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${this.toastText}
            </div>
        `
        toastContainer.appendChild(toast);
    }

    show(autohide=true) {
        const toast = document.getElementById(this.id);
        toast.setAttribute("data-bs-autohide", `${autohide}`);
        new bootstrap.Toast(toast).show();
    }

    hide() {
        const toast = document.getElementById(this.id);
        new bootstrap.Toast(toast).hide();
    }
}