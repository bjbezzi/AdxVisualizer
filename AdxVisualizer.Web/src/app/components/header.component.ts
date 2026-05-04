import { Component, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header', standalone: true, imports: [CommonModule],
  templateUrl: './header.component.html', styleUrl: './header.component.scss'
})
export class HeaderComponent { refresh = output<void>(); }
